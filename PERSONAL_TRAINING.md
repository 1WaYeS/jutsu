# Personalized camera-to-sentence prototype

Open http://127.0.0.1:5180/train . This is a new local training path, separate from the failed pretrained word model and from the manual sentence demo.

## First dataset

Use I, NEED, HELP, and NONE first (20 takes at the screening minimum).

1. Start the camera, select DroidCam if appropriate, and keep your head, shoulders, and signing hands visible.
2. Choose I and Training. Press Record next attempt, perform I once, then pause. Repeat for at least 3 distinct attempts.
3. Choose Testing and record at least 2 new attempts. Test takes are never used to fit the model or its rejection thresholds.
4. Repeat for NEED and HELP. Reference links are provided on the page; a fluent signer should verify your signing. This tool does not assess ASL correctness or directional/grammatical nuance.
5. Record NONE: ordinary non-sign movements and hands at rest. These use a 2.5-second capture rather than waiting for a sign-shaped motion. Collect at least 3 training and 2 fresh test takes.
6. Train my model, then Evaluate fresh tests. Labels with fewer than 3 training takes cannot train. Testing needs 2 fresh takes per trained label for the screen to be complete. Exact feature duplicates are rejected to reduce evaluation leakage.
7. Try live signing once trained. Before the test screen passes, predictions are suggestions only. After it passes, accepted labels accumulate as concepts. Unknown segments require review; missing concepts are not invented.
8. Sign I, pause, NEED, pause, HELP, pause; Finish sentence. The supported mapping is I need help. Review/correct, Confirm sentence, then Speak. Optional automatic playback occurs only after confirmation.

YES, NO, and HELLO can be trained with the same process. Adding/removing data invalidates the model and test gate; retrain and reevaluate. Data stays in this browser until deleted; use Export examples & results for a backup. The model is rebuilt from local samples after a page refresh.

## Implementation

- MediaPipe Holistic tracks hands, upper body, and lips. Existing upstream normalization creates 460-dimensional per-frame features, resampled to at most 32 frames. It supplies tracking only; no GestureSign word checkpoint is loaded by this training path.
- A supervised nearest-neighbour classifier compares recorded sequences using dynamic time warping. Its radii are fitted using training takes only, and it rejects distant or ambiguous matches. These distances are not calibrated probabilities.
- The classifier runs in a browser worker. Example features are stored in IndexedDB only when the user records, with explicit labels and train/test splits. No raw camera video is saved or uploaded.
- The initial screen requires at least two sign classes plus NONE; 3 training takes per class; 2 independent tests per trained class; 80% or better correct per class; and zero observed false sign triggers on NONE. At the two-test minimum, both must succeed. This is a small prototype screen, not general ASL validation.
- Accepted concepts go to sentence-builder.js. Speech requires user confirmation. Manual edits are explicitly identified as corrections.

## Verification and limits

- Build and syntax checks pass; 19 automated tests/groups pass overall, including 7 new synthetic algorithm tests. Generated feature tests verify mechanics, not accuracy on real signing.
- Browser checks verified empty-data rejection, local data counts, MediaPipe tracker startup, and camera cleanup. No real user sign dataset was fabricated or preloaded.
- No real-signing recognition accuracy or successful user I NEED HELP camera translation is claimed yet. That requires the user's recordings and fresh evaluation.
- Personalized template recognition may still fail on different lighting, framing, signing styles, or people. Unseen movements can resemble trained signs. It is not continuous-ASL sentence translation and does not replace a trained interpreter.

## NEED / HELP investigation
The saved user dataset (33 training and 29 test takes) reproduced I 7/7, NEED 3/8, HELP 0/7, NONE 7/7, 10 missed signs, and zero background false triggers. Detailed evaluation now lists nearest candidates, distance limits, rejection reasons, both-hand frame coverage, and recorded duration where available.
Two HELP tests tracked both hands in 0/15 and 0/27 feature frames and were predicted as I. HELP training captures showed both hands in only 2–14 of 32 feature frames. This is evidence of missing tracking, not proof of incorrect signing. Several NEED rejects had NEED nearest but beyond the training-derived radius; others were distant from all examples. Saved features cannot reconstruct a hand that was never captured or prove the complete sign was performed.
A hand-weighted metric was evaluated against the same recordings and produced no improvement in per-label results. It was reverted; the original scoring and pass gate remain. This development comparison is not an independent new accuracy evaluation.
New HELP recordings require both-hand tracking in at least 40% of feature frames, otherwise the take is not saved and framing/overlap guidance is displayed. This is a capture-quality guard, not proof that an accepted take is a valid or complete ASL HELP sign. Existing examples were not removed or relabeled. Record better-captured HELP examples before judging recognition improvements. The current model still does not pass screening.
20 automated tests/groups pass after the diagnostic changes. No success claim for NEED or HELP is made.

## Two-hand tracking update
The personalized camera path now runs a dedicated MediaPipe HandLandmarker configured for two hands alongside Holistic. When the full-image detector finds more hands, its detections are assigned to body wrists using the existing feature layout. Missing hands are never synthesized. The page shows per-hand tracking and processing time. Existing recordings remain untouched. Improved sign accuracy has not yet been established; record fresh held-out tests to measure the effect. Fully occluded hands can still be missed.

Browser startup check: dedicated HandLandmarker and Holistic initialized successfully with DroidCam on localhost. Camera frames processed (observed 69 ms/frame with no signer in view). Camera stopped afterward; no samples recorded or deleted. Physical two-hand accuracy and HELP improvement remain unverified. Each task uses a distinct local WASM-loader module URL because MediaPipe clears ModuleFactory after initialization.
