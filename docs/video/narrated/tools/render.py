import subprocess,json,math,textwrap
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[2]
out=root/'narrated'
chapters=json.loads((out/'chapters.json').read_text())
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
color='#234D3C'; muted='#53695D'; bg='#F5F3E8'
bullets={
'intro':['Small outdoor moments around your actual week','Walking, reading, gardening, photography and more','Android emulator • locally running backend'],
'preferences':['Interests and intensity','Days per week and activity duration','Travel estimates, equipment and optional location'],
'schedule':['Sleep, work, commute and other commitments','Explicit lunch breaks and full days off','Review all seven days, then confirm'],
'generation':['1  Scheduler calculates eligible time slots','2  Mastra asks local Gemma to personalize ideas','3  Separate checks validate the full time budget','4  One repair attempt if validation fails','5  Clearly labelled basic fallback when needed'],
'week':['A saved week labelled personalized with Gemma','Varied activities, places and optional mini missions','Review suggestions before accepting'],
'budget':['Preparation + travel + activity + return buffer','Accept, move, replace or skip','Check daylight, access and real travel conditions'],
'missions':['Action checklists and written reflections','Photo subject selection and Gemma vision checks','Camera unlocks after acceptance and start time'],
'places':['Nearby parks, rivers and mapped loop hikes','Source-linked places, forecasts and daylight','Map distance is not a calculated travel time'],
'progress':['Completed or partly completed • honest feedback','Cached plans and queued offline completion','Generation needs backend access • real-phone tests next']}
def probe(p):
 value=subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(p)],text=True).strip()
 return float(value) if value and value!='N/A' else 0.0
def run(args): subprocess.run(args,check=True)
def stamp(t,ass=False):
 if ass:
  cs=round(t*100); return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'
 ms=round(t*1000); return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
def cues(words):
 result=[]; group=[]
 for w in words:
  group.append(w)
  if len(group)>=8 or w['text'].endswith(('.', '?', '!')):
   result.append((group[0]['start'],group[-1]['end'],' '.join(x['text'] for x in group))); group=[]
 if group: result.append((group[0]['start'],group[-1]['end'],' '.join(x['text'] for x in group)))
 return result
asshead='''[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,34,&H003C4D23,&H003C4D23,&H00E8F3F5,&H00E8F3F5,0,0,0,0,100,100,0,0,1,2,0,2,90,620,70,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'''
sources={}
for c in chapters+[{'id':'schedule-review'}]:
 name=c['id']; raw=out/f'{name}-raw.mp4'
 if not raw.exists(): continue
 if probe(raw)<.01:
  still=out/f'{name}-still.png'; normalized=out/f'{name}-normalized.mp4'
  run(['ffmpeg','-y','-v','error','-i',str(raw),'-frames:v','1',str(still)])
  run(['ffmpeg','-y','-v','error','-loop','1','-framerate','30','-i',str(still),'-t','14','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p',str(normalized)])
  sources[name]=normalized
 else: sources[name]=raw
allcues=[]; offset=0; entries=[]
for index,c in enumerate(chapters):
 i=c['id']; audio=out/f'{i}.mp3'; duration=probe(audio)+.65
 img=Image.new('RGB',(1920,1080),bg); d=ImageDraw.Draw(img)
 d.text((90,65),'OUTWARDS DAYS',font=ImageFont.truetype(bold,30),fill=color)
 d.text((90,125),f'{index+1:02} / {len(chapters):02}  ·  APP WALKTHROUGH',font=ImageFont.truetype(font,22),fill=muted)
 y=205
 for line in textwrap.wrap(c['title'],width=31):
  d.text((90,y),line,font=ImageFont.truetype(bold,58),fill=color); y+=77
 y=max(y+55,405)
 for b in bullets[i]:
  lines=textwrap.wrap(b,width=52)
  if i=='generation':
   d.rounded_rectangle((90,y-8,1210,y+len(lines)*43+17),radius=16,fill='#E3E9D5')
   x=115
  else: x=125; d.ellipse((92,y+15,103,y+26),fill=color)
  for line in lines:
   d.text((x,y),line,font=ImageFont.truetype(font,33),fill=color); y+=44
  y+=28 if i!='generation' else 16
 d.rounded_rectangle((1434,57,1890,1032),radius=28,fill='#234D3C')
 label='AI process explained · saved plan shown' if i=='generation' else 'Android emulator · prototype'
 d.text((90,1020),label,font=ImageFont.truetype(font,22),fill=muted)
 img.save(out/f'{i}-background.png')
 cs=cues(json.loads((out/f'{i}-words.json').read_text()))
 (out/f'{i}.ass').write_text(asshead+''.join(f'Dialogue: 0,{stamp(a,True)},{stamp(b,True)},Default,,0,0,0,,{t}\n' for a,b,t in cs))
 for a,b,t in cs: allcues.append((offset+a,offset+b,t))
 raw=sources.get(i,out/f'{i}-raw.mp4')
 if i=='generation': raw=out/'generation-raw.mp4' if (out/'generation-raw.mp4').exists() else out/'week-raw.mp4'
 if i=='schedule':
  (out/'schedule-source.txt').write_text(''.join(f"file '{sources[x].name}'\n" for x in ['schedule','schedule-review']))
  raw=out/'schedule-combined.mp4'
  run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(out/'schedule-source.txt'),'-c','copy',str(raw)])
 ratio=duration/probe(raw)
 dest=out/f'{i}-rendered.mp4'
 filt=f"[1:v]setpts={ratio}*(PTS-STARTPTS),fps=30,scale=430:960:force_original_aspect_ratio=decrease,pad=430:960:(ow-iw)/2:(oh-ih)/2:color=0xf5f3e8[phone];[0:v][phone]overlay=1447:64,subtitles={out/i}.ass[v]"
 run(['ffmpeg','-y','-v','error','-loop','1','-framerate','30','-i',str(out/f'{i}-background.png'),'-i',str(raw),'-i',str(audio),'-filter_complex',filt,'-map','[v]','-map','2:a','-af','loudnorm=I=-16:TP=-1.5:LRA=11,apad','-t',str(duration),'-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',str(dest)])
 entries.append(f"file '{dest.name}'"); c['startSeconds']=round(offset,3); c['durationSeconds']=round(duration,3); offset+=duration
 print('Rendered '+i,flush=True)
(out/'concat.txt').write_text('\n'.join(entries)+'\n')
(root/'outwards-days-full-narrated.srt').write_text('\n\n'.join(f'{n+1}\n{stamp(a)} --> {stamp(b)}\n{t}' for n,(a,b,t) in enumerate(allcues))+'\n')
run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(out/'concat.txt'),'-c','copy','-movflags','+faststart',str(root/'outwards-days-full-narrated.mp4')])
(out/'chapters.json').write_text(json.dumps(chapters,indent=2))
print('Done',offset,flush=True)
