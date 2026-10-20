"""Fetch four fixed, hash-verified frontend packages; no install scripts."""
from pathlib import Path
import base64,hashlib,io,json,tarfile,urllib.request
root=Path(__file__).resolve().parents[1]
for row in json.loads((root/'docs/DEPENDENCIES.lock.json').read_text(encoding='utf8')):
    dest=root/'.deps/node_modules'/row['name']
    if dest.exists():
        raise SystemExit(f'Existing destination: {dest}; use a fresh dependency directory')
    with urllib.request.urlopen(row['url'],timeout=120) as response:
        data=response.read()
    assert hashlib.sha256(data).hexdigest()==row['sha256'], 'SHA-256 mismatch'
    algorithm,value=row['integrity'].split('-',1)
    assert base64.b64encode(hashlib.new(algorithm,data).digest()).decode()==value, 'Integrity mismatch'
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
        members=archive.getmembers()
        for member in members:
            parts=Path(member.name).parts
            if not parts or parts[0]!='package' or '..' in parts or member.issym() or member.islnk():
                raise ValueError('Unsafe package entry')
        dest.mkdir(parents=True)
        for member in members:
            member.name=str(Path(*Path(member.name).parts[1:]))
            if member.name!='.':
                archive.extract(member,dest,filter='data')
    print(row['name'],row['version'],'verified')
