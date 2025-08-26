import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import wgslScreenspace from './vite.wgsl-screenspace';

export default defineConfig({
  plugins: [
    wgslScreenspace(),
    glsl(),
  ],
});
