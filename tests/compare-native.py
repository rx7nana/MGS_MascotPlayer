from pathlib import Path
import argparse,subprocess,struct,json,hashlib
p=argparse.ArgumentParser();p.add_argument('--reference',required=True);p.add_argument('--candidate',required=True);p.add_argument('--driver',required=True);p.add_argument('--song',required=True);p.add_argument('--report',required=True);p.add_argument('--seconds',type=int,default=12);a=p.parse_args()
class Engine:
 def __init__(self,exe):self.p=subprocess.Popen([exe,'stream',a.driver,a.song,'48000','on','mgsdrv320','0','1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 def get(self,n):
  out=b''
  while len(out)<n:
   d=self.p.stdout.read(n-len(out))
   if not d:raise RuntimeError('Native EOF')
   out+=d
  return out
 def packet(self,command):
  self.p.stdin.write((command+'\n').encode());self.p.stdin.flush();h=struct.unpack('<7I',self.get(28));pcm=self.get(h[0]*2);rows=self.get(h[6]);return h,pcm,rows
 def close(self):self.p.stdin.write(b'QUIT\n');self.p.stdin.flush();self.p.stdin.close();self.p.wait(timeout=5);assert self.p.returncode==0
def equivalent(x,y):
 return x[0][:4]==y[0][:4] and x[0][6]==y[0][6] and x[1:]==y[1:]
out=[]
for mode in['READ','ADVANCE']:
 engines=[Engine(a.reference),Engine(a.candidate)];checks=[];hashes=[hashlib.sha256(),hashlib.sha256()]
 try:
  if mode=='READ':
   for pos in range(0,a.seconds*48000,1024):
    n=min(1024,a.seconds*48000-pos);v=[e.packet('READ '+str(n))for e in engines];assert equivalent(v[0],v[1]),('PCM/event/state mismatch',pos);[h.update(x[1])for h,x in zip(hashes,v)]
   checks.append({'frames':a.seconds*48000,'PCMAndEventPacketsEqual':True,'SHA256':[h.hexdigest()for h in hashes]})
  else:
   limit=300*48000
   for target in[3,6,9]:
    v=[e.packet(f'ADVANCE {target*48000} {limit} 100 240000')for e in engines];assert equivalent(v[0],v[1]);w=[e.packet('READ 1024')for e in engines];assert equivalent(w[0],w[1]);checks.append({'advanceCount':target*48000,'PCMAndEventPacketsEqual':True})
 finally:
  for e in engines:e.close()
 out.append({'mode':mode,'checks':checks,'pass':True})
Path(a.report).write_text(json.dumps({'pass':True,'cases':out,'note':'Same external fixture and driver; no music/COM is included. Header CPU milliseconds and working-set telemetry are excluded from equality; frame count, end flag, loops, rate, event length, PCM and event bytes must match.'},indent=2),encoding='utf8');print(json.dumps(out))
