import{MotionBeatSync}from './beat-sync.js';
export const vgmBpm=value=>typeof value==='number'&&Number.isFinite(value)&&value>=20&&value<=400;
export function commitBpm(text,previous=120){const value=String(text).trim()?Number(text):NaN;return vgmBpm(value)?value:previous}
export function vgmRecord(cfg,path,info){if(info?.inputSHA256)return cfg.vgmTracks?.[info.inputSHA256];if(info?.error)return Object.values(cfg.vgmTracks||{}).find(r=>r.paths?.includes(path));return undefined}
// Receives the existing audio position; does not start a timer or playback engine.
export function vgmMotionAt(position,bpm,profile){if(!Number.isFinite(position)||position<0||!vgmBpm(bpm)||!vgmBpm(profile.baseBpm))throw Error('Invalid VGM BPM/position');return new MotionBeatSync(profile).at({beat:position*bpm/60,bpm,driverHz:60})}
