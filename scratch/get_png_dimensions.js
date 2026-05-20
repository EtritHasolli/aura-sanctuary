import fs from 'fs';
import path from 'path';

const dir = 'c:/Users/Marijan Kolaj/Desktop/aura-sanctuary/forge';
const files = fs.readdirSync(dir);

console.log('PNG Dimensions:');
files.forEach(file => {
  if (file.endsWith('.png')) {
    const filePath = path.join(dir, file);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 16); // read width and height
    fs.closeSync(fd);
    
    const width = buffer.readUInt32BE(0);
    const height = buffer.readUInt32BE(4);
    const stats = fs.statSync(filePath);
    
    console.log(`${file}: ${width}x${height} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  }
});
