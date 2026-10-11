import asyncio,json
from pathlib import Path
import edge_tts
out=Path(__file__).resolve().parents[1]
sem=asyncio.Semaphore(3)
async def speak(c):
 async with sem:
  chunks=[]
  with (out/(c['id']+'.mp3')).open('wb') as f:
   async for x in edge_tts.Communicate(c['text'],'en-AU-NatashaNeural',rate='+3%',boundary='WordBoundary').stream():
    if x['type']=='audio': f.write(x['data'])
    elif x['type']=='WordBoundary': chunks.append({'start':x['offset']/1e7,'end':(x['offset']+x['duration'])/1e7,'text':x['text']})
  (out/(c['id']+'-words.json')).write_text(json.dumps(chunks))
  print('Timed voice '+c['id'],flush=True)
async def main(): await asyncio.gather(*(speak(c) for c in json.loads((out/'chapters.json').read_text())))
asyncio.run(main())
