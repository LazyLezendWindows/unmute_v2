import express, { Router } from 'express';
import verificationRoutes from './verificationRoutes';
import premiumRoutes from './premiumRoutes';
import { ProfileController } from '../controllers/profileController';
import { LocationController } from '../controllers/locationController';
import { EducationController } from '../controllers/educationController';
import { requireAuth } from '../middleware/auth';
import { locationRateLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validate';
import { updateProfileSchema } from '../validators/profileValidator';
import { setLocationSchema, updatePrecisionSchema } from '../validators/locationValidator';
import { setEducationSchema } from '../validators/educationValidator';

const router = Router();

router.use(requireAuth);

router.get('/me', ProfileController.getMyProfile);
router.patch('/me', validateBody(updateProfileSchema), ProfileController.updateMyProfile);
router.get('/interests', ProfileController.getInterests);
// The photo is the request body itself (no multipart), up to 5 MB; its bytes decide the type.
router.post(
  '/me/photos',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  ProfileController.uploadPhoto
);
// A voice message recording, up to 3 MB; its bytes decide the format.
router.post(
  '/me/voice',
  express.raw({ type: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'video/webm'], limit: '3mb' }),
  ProfileController.uploadVoice
);

router.use('/me/verification', verificationRoutes);
router.use('/me/premium', premiumRoutes);

router.put('/me/location', locationRateLimiter, validateBody(setLocationSchema), LocationController.setMyLocation);
router.patch('/me/location', validateBody(updatePrecisionSchema), LocationController.updateMyPrecision);
router.delete('/me/location', LocationController.clearMyLocation);

router.put('/me/education', validateBody(setEducationSchema), EducationController.setMyEducation);
router.delete('/me/education', EducationController.clearMyEducation);

export default router;
