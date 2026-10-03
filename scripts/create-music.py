"""Create an original, gentle instrumental loop. No sampled commercial recording."""
import math, wave, struct
rate=22050; duration=48
samples=[0.0]*(rate*duration)
# A slow original arpeggio, in C major / A minor.
chords=[(48,55,60,64),(45,52,57,60),(53,60,65,69),(43,50,55,59)]
for bar in range(8):
 notes=chords[bar%4]
 for beat in range(8):
  midi=notes[beat%4]+(12 if beat>3 else 0)
  freq=440*2**((midi-69)/12);start=int((bar*6+beat*.75)*rate)
  for j in range(min(int(3.4*rate),len(samples)-start)):
   t=j/rate;env=(1-math.exp(-t*38))*math.exp(-t*1.6)
   v=(math.sin(2*math.pi*freq*t)+.23*math.sin(2*math.pi*freq*2*t)+.07*math.sin(2*math.pi*freq*3*t))*env*.15
   samples[start+j]+=v
with wave.open('/tmp/wedding-original.wav','wb') as w:
 w.setparams((1,2,rate,0,'NONE','not compressed'))
 w.writeframes(b''.join(struct.pack('<h',int(max(-1,min(1,v))*min(1,i/rate,(len(samples)-i)/rate/2)*27000)) for i,v in enumerate(samples)))
