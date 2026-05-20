import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const dir = 'c:/Users/Marijan Kolaj/Desktop/aura-sanctuary/forge';
const files = fs.readdirSync(dir);

async function analyze() {
  console.log('Analyzing non-transparent bounding boxes:');
  for (const file of files) {
    if (file.endsWith('.png')) {
      const filePath = path.join(dir, file);
      try {
        const image = sharp(filePath);
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
        
        let minX = info.width;
        let maxX = -1;
        let minY = info.height;
        let maxY = -1;
        
        // Channel count
        const channels = info.channels;
        
        for (let y = 0; y < info.height; y++) {
          for (let x = 0; x < info.width; x++) {
            const idx = (y * info.width + x) * channels;
            // Check alpha channel (usually the last channel)
            const alpha = channels === 4 ? data[idx + 3] : 255;
            if (alpha > 10) { // not fully transparent
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        
        if (maxX === -1) {
          console.log(`${file}: Fully transparent`);
        } else {
          const w = maxX - minX + 1;
          const h = maxY - minY + 1;
          console.log(`${file}: Bounding Box -> X: ${minX}..${maxX} (${w}px), Y: ${minY}..${maxY} (${h}px)`);
        }
      } catch (err) {
        console.error(`Error processing ${file}:`, err);
      }
    }
  }
}

analyze();
