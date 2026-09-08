import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readExif, formatExif, getExifLayout, compositionSize, defaultExifVisibility, drawExif } from '../src/exif.js'
const image = { naturalWidth: 640, naturalHeight: 480 }
const metadata = { maker: 'SONY', camera: 'ILCE-7M4', lens: 'FE 50mm F1.8', shooting: '50mm  ·  f/2.8  ·  1/250s  ·  ISO 400' }
test('Read standard EXIF from PNG fixture', async () => {
  assert.deepEqual(await readExif(await readFile(new URL('./exif-sample.png', import.meta.url))), metadata)
})
test('Missing and invalid values never become fabricated camera settings', async () => {
  assert.deepEqual(await readExif(await readFile(new URL('./no-exif.png', import.meta.url))), formatExif())
  assert.equal(formatExif({ ExposureTime: 2.5 }).shooting, '2.5s')
  assert.equal(formatExif({ ISO: NaN, FNumber: 0, ExposureTime: Infinity }).shooting, '')
})
test('All 16 toggle combinations preserve native image bounds and output ratio', () => {
  const keys = Object.keys(defaultExifVisibility)
  for (let mask=0;mask<16;mask++) {
    const visibility=Object.fromEntries(keys.map((k,i)=>[k,Boolean(mask & (1<<i))]))
    const layout=getExifLayout(image,metadata,visibility,true)
    assert.equal(layout.lines.includes(metadata.camera),visibility.camera)
    assert.equal(layout.lines.includes(metadata.lens),visibility.lens)
    assert.equal(layout.lines.includes(metadata.shooting),visibility.shooting)
    assert.equal(Boolean(layout.logoSize),visibility.maker)
    if (!mask) assert.equal(layout.height,0)
    for (const ratio of ['4:5','3:4','1:1','9:16','16:9']) {
      const [w,h]=ratio.split(':').map(Number)
      const size=compositionSize(image,{ratio,padding:0},layout.height)
      assert.equal(size.width*h,size.height*w)
      assert.ok(size.width>=640)
      assert.ok(size.height-layout.height>=480)
    }
  }
})
test('Absent EXIF adds no strip; unsupported maker falls back to text',()=>{
  assert.equal(getExifLayout(image,{},defaultExifVisibility).height,0)
  assert.deepEqual(getExifLayout(image,{maker:'Unknown'},defaultExifVisibility).lines,['Unknown'])
})
test('Footer only draws visible text and stays below the image region',()=>{
  const layout=getExifLayout(image,metadata,{camera:true},false,{exifStyle:'box'})
  const texts=[];const rects=[]
  const ctx={save(){},restore(){},fillRect(...args){rects.push(args)},measureText(s){return {width:s.length*10}},fillText(...args){texts.push(args)}}
  drawExif(ctx,640,800,layout,null)
  assert.deepEqual(texts.map(t=>t[0]),['ILCE-7M4'])
  assert.equal(rects[0][1],800-layout.height)
  assert.ok(texts[0][2]>800-layout.height)
})

