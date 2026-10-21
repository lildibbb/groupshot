# Camera performance benchmark

Use this sheet to compare the original camera preview, fast cutout, and HD still capture on the devices where people report lag. Record results locally. Do not save or send camera frames as part of diagnostics.

## Test setup

- Use the same browser version and camera resolution for each pass.
- Test solo, then with a second participant, then with the largest room size available.
- Run each mode for five minutes after the camera has warmed up.
- Compare original scene with cutout scenes. For cutout, record HD hair detail both off and on where supported.
- Repeat once on battery power and once while charging if thermal throttling is suspected.
- Capture a frame at the start and end of each pass to compare edge quality. Keep these samples on the test device and remove them when finished.

## Local readout

In the booth, open **Room** and enable **Local camera diagnostics**. With a cutout scene active, record the displayed frames per second, average frame time, and most recent segmentation time. The toggle persists on the device and does not send timing or image data to the server.

Use browser developer tools for additional evidence:

- Performance recording: inspect long tasks, scripting, paint and dropped frames.
- Memory panel: record heap at the start and end of the run.
- Device settings: note battery drain and whether the device becomes hot or dims the display.
- Network panel: verify camera media is not uploaded by diagnostics. Shared rooms still send the video stream and captured shots required for the session.

## Results

| Device / browser | Room size | Scene / HD | FPS | Frame ms | Segmentation ms | Long tasks | Memory start / end | Battery or heat notes | Edge quality |
|---|---:|---|---:|---:|---:|---|---|---|---|
| | | | | | | | | | |

## Interpretation

Treat the readout as a device-specific comparison, not as a performance guarantee. If FPS falls during the run, first compare with the original scene, then disable HD hair detail. Record the point at which quality becomes unacceptable before lowering segmentation resolution further. Set numeric release thresholds after collecting results from supported target devices.
