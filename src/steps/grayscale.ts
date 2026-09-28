import { register } from '../core/registry';
import type { Raster, Step } from '../core/types';

const step: Step<Raster, Raster> = {
  name: 'grayscale', in: 'raster', out: 'raster',
  run(input) {
    const context = input.canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context is unavailable');
    const image = context.getImageData(0, 0, input.canvas.width, input.canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      const luma = 0.2126 * image.data[index] + 0.7152 * image.data[index + 1] + 0.0722 * image.data[index + 2];
      image.data[index] = luma;
      image.data[index + 1] = luma;
      image.data[index + 2] = luma;
    }
    context.putImageData(image, 0, 0);
    return input;
  },
};

register('grayscale', () => step);
