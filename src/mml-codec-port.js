function decodeMml(buf,encoding='AUTO'){
 if(!buf.length)throw Error('空ファイルです');let text;
 if(buf[0]===255&&buf[1]===254){if(buf.length%2)throw Error('UTF-16の長さが不正です');text=new TextDecoder('utf-16le',{fatal:true}).decode(buf.subarray(2));}
 else if(buf[0]===254&&buf[1]===255){if(buf.length%2)throw Error('UTF-16の長さが不正です');text=new TextDecoder('utf-16be',{fatal:true}).decode(buf.subarray(2));}
 else{try{text=new TextDecoder(encoding==='SJIS'?'shift-jis':'utf-8',{fatal:true}).decode(buf)}catch(e){if(encoding==='UTF8'||encoding==='SJIS')throw e;text=new TextDecoder('shift-jis',{fatal:true}).decode(buf)}}
 if(text.includes('\0'))throw Error('NULを含むバイナリはMMLとして扱えません');return text;
}

export {decodeMml};