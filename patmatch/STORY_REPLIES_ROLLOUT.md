# Story reply rollout

1. Deploy the Django backend and apply `pets.0044_story_replies` before publishing the mobile build. Keep the current Firestore rules during this phase.
2. Run `python manage.py backfill_chat_permissions` with the production Firebase Admin credentials. Verify the command completes and that newly created, archived, approved, and blocked rooms receive the expected `permissionStatus` and `participantUids` fields.
3. Publish the mobile build containing Django-to-Firebase custom-token sign-in and the story reply UI. Verify existing adoption, breeding, and clinic chats on both platforms.
4. Create the composite index in `firestore.indexes.story-replies.json` and wait until it is ready. Run `firestore_tests` against the emulator before promoting `firestore.story-replies.v2.rules`.
5. Set the existing `accounts/app-config` hard minimum mobile version to the first released build with Firebase sign-in. Confirm older builds are gated, then deploy the versioned Firestore rules. The rules deny client writes in pending, rejected, archived, or blocked rooms and reserve story references for server writes.
6. Monitor `NotificationOutbox` rows for `chat_permission_sync`, `story_reply_received`, and `story_reply_approved`, including retries and failures. Re-run the backfill if any room permission document is missing.

The rules and index files are rollout artifacts; they are not active until explicitly deployed to Firebase.
