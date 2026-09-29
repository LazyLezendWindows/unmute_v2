"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeholders = placeholders;
exports.blockedBetween = blockedBetween;
/** `?, ?, ?` for an IN (...) list; callers must not pass an empty array. */
function placeholders(count) {
    return Array.from({ length: count }, () => '?').join(', ');
}
/** SQL predicate: true when either of two user-id columns has blocked the other. */
function blockedBetween(userColA, userColB) {
    return `EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = ${userColA} AND b.blocked_id = ${userColB})
       OR (b.blocker_id = ${userColB} AND b.blocked_id = ${userColA})
  )`;
}
