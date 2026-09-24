import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { toOwnProfile } from '../mappers/profileMapper';
import { ProfileRepository } from '../repositories/profileRepository';
import { InterestRepository } from '../repositories/interestRepository';
import { InteractionRepository } from '../repositories/interactionRepository';
import { UpdateProfileInput } from '../validators/profileValidator';
import { MEDIA_PATH, MediaService } from './mediaService';

export class ProfileService {
  /** The signed-in user's own profile (includes date of birth). */
  static async getProfile(userId: string) {
    const [profile, interests, likesReceived] = await Promise.all([
      ProfileRepository.findByUserId(userId),
      InterestRepository.forUser(userId),
      InteractionRepository.countLikesReceived(userId),
    ]);
    if (!profile) {
      throw new AppError('Profile not found', 404);
    }
    return { ...toOwnProfile(profile, interests), likesReceived };
  }

  static async updateProfile(userId: string, input: UpdateProfileInput) {
    if (!(await ProfileRepository.findByUserId(userId))) {
      throw new AppError('Profile not found', 404);
    }

    const images = [input.avatarUrl, ...(input.photos ?? [])].filter((url): url is string => Boolean(url));
    if (images.some((url) => url.startsWith(MEDIA_PATH) && !MediaService.isOwnUpload(url, userId))) {
      throw new AppError('Use photos you uploaded yourself.', 403);
    }

    const interestIds = input.interestIds !== undefined ? [...new Set(input.interestIds)] : undefined;
    if (interestIds && (await InterestRepository.countExisting(interestIds)) !== interestIds.length) {
      throw new AppError('One or more selected interests are no longer available', 400);
    }

    // Profile fields and the interest set change together or not at all.
    await getDatabase().transaction(async (tx) => {
      await ProfileRepository.update(tx, userId, {
        display_name: input.displayName,
        bio: input.bio,
        avatar_url: input.avatarUrl,
        interaction_preferences:
          input.interactionPreferences !== undefined ? JSON.stringify(input.interactionPreferences) : undefined,
        gender: input.gender,
        profession: input.profession,
        height_cm: input.heightCm,
        drinking: input.lifestyle?.drinking,
        smoking: input.lifestyle?.smoking,
        workout: input.lifestyle?.workout,
        photos: input.photos !== undefined ? JSON.stringify(input.photos) : undefined,
        education_level: input.educationLevel,
        profession_field: input.professionField,
      });
      if (interestIds !== undefined) {
        await InterestRepository.replaceForUser(tx, userId, interestIds);
      }
    });

    return this.getProfile(userId);
  }

  static getAllInterests() {
    return InterestRepository.listAll();
  }
}
