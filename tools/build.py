from pathlib import Path
import argparse,subprocess,json,os,shutil,hashlib
p=argparse.ArgumentParser(description="Fixed LLVM-MinGW/WebView2 build; never modifies release ZIPs")
p.add_argument('--llvm-bin',required=True);p.add_argument('--webview2-sdk',required=True);p.add_argument('--cmake',default='cmake');p.add_argument('--ninja',default='ninja');p.add_argument('--esbuild',required=True);p.add_argument('--node-modules');p.add_argument('--out',default='build/verification')
a=p.parse_args();root=Path(__file__).resolve().parents[1];out=(root/a.out).resolve();out.relative_to(root/'build');out.mkdir(parents=True,exist_ok=False);app=out/'app';app.mkdir();logs=[];llvm=Path(a.llvm_bin).resolve();sdk=Path(a.webview2_sdk).resolve();include=sdk/'build/native/include';loader=sdk/'build/native/x64/WebView2Loader.dll';assert(include/'WebView2.h').exists()and loader.exists()
def run(cmd,cwd=None,env=None):
 r=subprocess.run([str(x)for x in cmd],cwd=cwd or root,env=env,capture_output=True,text=True,encoding='utf8',errors='replace');logs.append({'command':[str(x)for x in cmd],'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr});(out/'build-log.json').write_text(json.dumps(logs,ensure_ascii=False,indent=2),encoding='utf8');print(Path(str(cmd[0])).name,r.returncode,flush=True)
 if r.returncode:raise RuntimeError(r.stdout+'\n'+r.stderr)
 return r.stdout
versions={}
for key,cmd in [('compiler',[llvm/'x86_64-w64-mingw32-clang++.exe','--version']),('cmake',[a.cmake,'--version']),('ninja',[a.ninja,'--version']),('esbuild',[a.esbuild,'--version'])]:versions[key]=run(cmd)
(out/'tool-versions.json').write_text(json.dumps(versions,indent=2),encoding='utf8');web=app/'web';shutil.copytree(root/'src',web)
for f in web.rglob('*.cjs'):f.unlink()
for src,dest in[(root/'assets/model',web/'model'),(root/'assets/web-assets',web/'assets')]:shutil.copytree(src,dest)
shutil.copy2(root/'assets/ui/icon.png',web/'icon.png')
for f in(root/'third_party/ammo').iterdir():shutil.copy2(f,web/f.name)
env=os.environ.copy()
if a.node_modules:env['NODE_PATH']=str(Path(a.node_modules).resolve())
run([a.esbuild,str(root/'src/ui.js'),'--bundle','--format=esm','--platform=browser','--target=esnext','--charset=utf8','--legal-comments=inline','--external:/ammo.wasm.js','--metafile='+str(out/'frontend-metafile.json'),'--outfile='+str(web/'ui.js')],env=env)
run([llvm/'x86_64-w64-mingw32-windres.exe','-i','app-icon.rc','-o',out/'app-icon.res','-O','coff'],cwd=root/'assets/windows')
run([llvm/'x86_64-w64-mingw32-clang++.exe','-std=c++17','-O2','-ffile-prefix-map='+str(root)+'=.','-ffile-prefix-map='+str(sdk)+'=/webview2-sdk','-DENABLE_ALT_CLOSE','-DWINVER=0x0A00','-D_WIN32_WINNT=0x0A00','-fms-extensions','-municode','-mwindows','-static','-Wall','-Wextra','-Wl,-Map='+str(out/'host.map'),'-I'+str(include),root/'native/host/composition.cpp',out/'app-icon.res','-o',app/'MGS_MascotPlayer.exe','-lole32','-luuid','-ldcomp','-luser32','-lgdi32','-lshell32','-lpsapi','-lbcrypt','-lcrypt32'])
run([a.cmake,'-S',root/'native/audio','-B',out/'audio','-G','Ninja','-DCMAKE_BUILD_TYPE=Release','-DCMAKE_SYSTEM_NAME=Windows','-DCMAKE_C_COMPILER='+str(llvm/'x86_64-w64-mingw32-clang.exe'),'-DCMAKE_CXX_COMPILER='+str(llvm/'x86_64-w64-mingw32-clang++.exe'),'-DCMAKE_RC_COMPILER='+(llvm/'x86_64-w64-mingw32-windres.exe').as_posix(),'-DCMAKE_MAKE_PROGRAM='+str(Path(a.ninja).resolve()),'-DMGS_BUILD_SEEK_PROBE=OFF'])
run([a.cmake,'--build',out/'audio','--target','audio-core','-j','4']);shutil.copy2(out/'audio/audio-core.exe',app/'audio-core.exe');shutil.copy2(loader,app/'WebView2Loader.dll');shutil.copy2(root/'config/defaults.json',app/'defaults.json');shutil.copytree(root/'licenses',app/'licenses')
for name in['README.md','CHANGELOG.md','THIRD-PARTY-NOTICES.md','LICENSE','LICENSE-SCOPE.md','ASSET-LICENSE.md']:
 if(root/name).exists():shutil.copy2(root/name,app/name)
# v035: ship the documentation linked by README (docs/PERFORMANCE_SET_FORMAT.md).
for name in ['ARCHITECTURE.md','BUILD.md','PERFORMANCE_SET_FORMAT.md','RELEASE.md','VERIFICATION.md','ICON_REPLACEMENT.md','FOREARM_FIX-v103.txt','PRIVACY_NOTICE.txt','VISUALIZER.md','TEXT_DISPLAY.md']:
 if(root/'docs'/name).exists():(app/'docs').mkdir(exist_ok=True);shutil.copy2(root/'docs'/name,app/'docs'/name)
if(root/'docs/PRIVACY_NOTICE.txt').exists():shutil.copy2(root/'docs/PRIVACY_NOTICE.txt',app/'PRIVACY_NOTICE.txt')
(out/'output-SHA256.json').write_text(json.dumps({str(f.relative_to(app)).replace('\\','/'):hashlib.sha256(f.read_bytes()).hexdigest()for f in app.rglob('*')if f.is_file()},ensure_ascii=False,indent=2),encoding='utf8');print('Build completed:',app)
