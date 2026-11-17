# Recognition-model qualification

Updated: 17 November 2026. Initial input language target: ASL. **No model currently passes JUTSU's recognition-first gate.**

This is a preliminary source/documentation review, not an installation, complete license audit, weight validation, or inference evaluation of the three newly supplied candidates.

| Candidate | Evidence inspected | Qualification status / next evidence needed |
| --- | --- | --- |
| [malhotra5/asl-translation](https://github.com/malhotra5/asl-translation) | Repository lists an MIT code license; README describes a WLASL-based bidirectional LSTM, training command, video inference, and a webcam demo. It explicitly limits the task to isolated signs. The visible root file listing does not contain the `models/sign_language_model.pth` required by its commands. | ASL candidate, not qualified. Locate actual recognition weights and labels, verify weight/data reuse terms, inspect preprocessing and inference code, install reproducibly, then test actual signing. A documented training command is not supplied pretrained weights. |
| [akshay-agile/Sign-Speak](https://github.com/akshay-agile/Sign-Speak) | README identifies ISL; root lists Keras checkpoints and a label encoder. It describes 30-frame, 126-feature hand sequences and server-side webcam capture. No code/model reuse permission was established in this preliminary review. | Not an ASL replacement. Establish explicit code/weight/data permissions and exact labels before reuse; evaluate phone-client camera transport separately from a server webcam. Do not copy or run it as the selected ASL engine. |
| [umanggpt120/sign_lang](https://github.com/umanggpt120/sign_lang) | README identifies ISL; root lists a Keras model, NumPy labels, and MediaPipe model. README run/file names differ from the root listing. No reuse permission was established in this preliminary review. | Not an ASL replacement. Verify licensing and actual code/weights/labels before any reuse. Its example expansion of “i water” to “I need water” must not be adopted as meaning-preserving evidence: it adds a need that the input did not establish. |

Primary sources: the linked repositories and their README/root listings. Statements about file listings are limited to the inspected listing, not a claim that no weight/license can exist elsewhere or be obtained from an author.

## Existing experiment

GestureSign source is retained at `vendor/GestureSign`, pinned to `ffc0578e68449676b6e9545da82092679914e8c8`. It supplies an isolated-sign model and code license; attribution is in THIRD_PARTY_NOTICES.md. Browser execution and tracking started, but the user's live YES attempt was reported as unrelated words such as “loud.” Therefore it failed this project's observed live-use test and is not approved as the production recognition engine. It remains at `/experimental`, with automatic speech disabled by default.

The main page's hand-written four-sign rules are also an experimental prototype, not a pretrained recognition model or validated sequence translator. User-reported HELLO/THANK YOU failures remain unresolved evidence.

## Required qualification record for the chosen candidate

- Repository/commit and recognition-weight URL/hash.
- Actual code/weight/data permissions and attribution obligations.
- One input sign language, task type, label map, feature order, normalization, timing, and inference commands.
- Hardware/dependency setup and measured inference time.
- Exact nominal vocabulary and the smaller release vocabulary, if applicable.
- Actual signing-video and webcam samples with provenance/consent and separation from tuning samples.
- Counts of correct labels, missed signs, wrong signs, unrelated-motion triggers, and incomplete/uncertain results; include raw predicted outputs.
- Specific YES/NO and HELLO/THANK YOU confusion tests where supported.
- Test criteria defined before final evaluation, including rejection of unrelated movements.
- A clear pass/fail decision supported by results, before rebuilding the live frontend around it.

## Current decision

Retain ASL as the target. Do not select a new engine based on documentation alone. No pretrained replacement or end-to-end natural-sentence translation has been proven by this specification update. Next engineering work is model/weight/license qualification followed by actual-signing tests, not another cosmetic frontend rebuild.

## Implementation investigation — 17 November

The ASL candidate and Microsoft baseline code were subsequently downloaded under research/ for inspection. The ASL checkout contains no recognition checkpoint. Its normal extractor emits 255 feature values (99 pose + 63 + 63 hands + 30 face), while training/padding configure 543; inference cannot be assumed reproducible without resolving the mismatch and obtaining the corresponding weights/labels.

Microsoft's baseline uses an older Python/CUDA/data preparation setup. Its separate [dataset materials license](https://www.microsoft.com/en-us/research/project/asl-citizen/dataset-license/) restricts use to noncommercial research and restricts redistribution/hosting. Those terms need a deployment-specific assessment, independent of the repository code license. No weights, dataset, or recognition evaluation were run for that baseline in this implementation.

No candidate passed qualification. The permitted fallback was implemented: a real camera-control interface with recognition explicitly unavailable, plus a separate manual sentence-builder and speech demonstration. See IMPLEMENTATION_STATUS.md for exact tests and failures. Neither the new interface nor the manual demo is evidence of camera translation.
