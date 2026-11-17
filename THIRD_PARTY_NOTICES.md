# GestureSign integration

Source: https://github.com/shashank11yadav/GestureSign

Pinned checkout: `ffc0578e68449676b6e9545da82092679914e8c8`.

Copyright (c) 2026 Shashank Yadav. GestureSign code is distributed under the MIT license, preserved in `vendor/GestureSign/LICENSE` and served at `/ai/GESTURESIGN-LICENSE.txt`.

Jutsu uses its supplied ONNX checkpoint, metadata, labels, feature extraction, segmentation, calibration, worker protocols, and tracking code. Upstream source is preserved; `build-ai.mjs` adapts worker URLs and the asset base during bundling. `ai-entry.ts` connects those modules to Jutsu's camera interface and speech controls. Jutsu did not train this checkpoint.

The model was trained upstream on Google Isolated Sign Language Recognition (`asl-signs`, PopSign), CC BY 4.0. Supplied replay landmarks retain the dataset attribution in `public-ai/replay/clips.json` and the visible model-check panel. Dataset source: https://www.kaggle.com/competitions/asl-signs/data . Dataset license: https://creativecommons.org/licenses/by/4.0/ . Jutsu does not distribute the full training dataset.

MediaPipe tracking: Google, Apache-2.0. ONNX Runtime Web: Microsoft, MIT. Dependency notices are retained in the installed packages; full relevant upstream credits are in `vendor/GestureSign/README.md`.

The model recognizes isolated signs, not unrestricted signed sentences. Upstream reported accuracy is not a measurement of Jutsu or this user's camera. Beginner performance and errors remain to be evaluated on live examples.

The personalized /train path reuses upstream landmark tracking, segmentation, and feature preprocessing under the preserved MIT notice, but does not load the upstream sign-classification checkpoint. JUTSU's personal-recognizer.js fits a supervised local DTW matcher from user-recorded examples. It has no pretrained ASL word vocabulary or shared training dataset. User recordings are separate from upstream model/data credits.
