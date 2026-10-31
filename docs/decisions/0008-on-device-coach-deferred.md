# ADR 0008: On-device coach model deferred; interface only

**Status:** accepted (Phase 11).

**Context.** Spec §24.3 lists an optional on-device model. The directive for this phase was to implement it only if a compatible runtime exists and a real, documented model URL and checksum can be recorded.

**What was checked.**

- `llama.rn` (the React Native binding for llama.cpp) supports the New Architecture and has an Expo config plugin, so a development build could include it.
- Its README does not document a specific model file, download URL or checksum; it points to searching for GGUF models on Hugging Face. Choosing a model (licence, size, quality for teaching text) and recording its checksum needs a human decision that this phase cannot make from memory.
- A model of a useful size is hundreds of megabytes to several gigabytes, which needs a download screen with progress, storage checks and resume, and testing on real phones for memory and heat.

**Decision.** Ship the interface only:

- `data/coach/types.ts` defines `OnDeviceModelManager` and `OnDeviceModelStatus`.
- `createUnsupportedOnDeviceModel()` is wired in the container and always reports "not supported in this build".
- The feature flag `onDeviceCoach` is off, and Settings says the on-device coach is not part of this version.

No native dependency is added.

**To revisit.** Pick a model with a licence that allows use on a phone, record its URL, size and SHA-256 in this ADR, add the download manager behind the existing interface, and measure memory and speed on the target phones.
