# WebGPU Geometrical Acoustics

A simple real-time WebGPU-based simulation of geometrical acoustics using ray tracing to model sound propagation, absorption, and reflections in a voxelized room.

---

## Setup

- Recommended browser: **Google Chrome**  
  (tested on version 143.0.7499.170, 64-bit)
- Start a local web server from the project root:
  ```bash
  python -m http.server
  ```
- Open the localhost URL in your browser

---

## How to Use

### Recursion Settings
Controls simulation accuracy and performance:
- **Max recursion depth**  
  Limits how many generations of child rays are spawned. Lower values improve performance.
- **Max recursion stack size**  
  Limits how many active child rays a single parent ray can have. Lower values reduce GPU workload.

Click **Save** to reload the simulation and apply the new settings to the shader.

---

### Hide Walls
Toggle wall visibility during runtime to make it easier to inspect the interior of the room.  
Walls remain solid in the simulation even when hidden.

---

### Emitter and Listener Position
Use the sliders to move the **emitter** and **listener** spheres in real time while the simulation is running.

---

### Heatmap Controls
Select which voxel face property is visualized:
- **Absorbed**  
  Shows the absorbed energy per voxel face. Energy is accumulated on the face where a ray enters.
- **Bounces**  
  Shows the number of ray collisions observed by each voxel face.

The **Sensitivity** slider controls color scaling for both modes, as values can vary significantly across the room.

---

### Input Audio File
1. Click **Choose File** to select a local audio file
2. Click **Load** to preprocess the file  
   (the button will change to **Play** once ready)
3. During playback, use **Pause** to stop both audio and simulation updates

---

### Graphs
Each graph includes **+** and **−** buttons for zooming in and out of the signal.

---

## Resources

### Libraries
- **FFT.js** — Fast Fourier Transform library by Fedor Indutny  
  https://github.com/indutny/fft.js
- **glMatrix** — High-performance vector and matrix math library  
  https://github.com/toji/gl-matrix
- **webgl-plot** — Lightweight plotting library for WebGL  
  https://github.com/danchitnis/webgl-plot

### Literature
- This project is heavily inspired by and informed by the work of **Taylor, Micah; Meng, Francis (2018)**  
  *Web-based Geometric Acoustic Simulator*  
  Proceedings of the 23rd International ACM Conference on 3D Web Technology (Web3D ’18)


