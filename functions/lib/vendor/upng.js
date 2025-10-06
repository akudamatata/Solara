// @ts-nocheck
// UPNG.js (decode-only build) - https://github.com/photopea/UPNG.js
// Licensed under the MIT License.

const UPNG = (function() {
	var _bin = {
		nextZero   : function(data,p)  {  while(data[p]!=0) p++;  return p;  },
		readUshort : function(buff,p)  {  return (buff[p]<< 8) | buff[p+1];  },
		writeUshort: function(buff,p,n){  buff[p] = (n>>8)&255;  buff[p+1] = n&255;  },
		readUint   : function(buff,p)  {  return (buff[p]*(256*256*256)) + ((buff[p+1]<<16) | (buff[p+2]<< 8) | buff[p+3]);  },
		writeUint  : function(buff,p,n){  buff[p]=(n>>24)&255;  buff[p+1]=(n>>16)&255;  buff[p+2]=(n>>8)&255;  buff[p+3]=n&255;  },
		readASCII  : function(buff,p,l){  var s = "";  for(var i=0; i<l; i++) s += String.fromCharCode(buff[p+i]);  return s;    },
		writeASCII : function(data,p,s){  for(var i=0; i<s.length; i++) data[p+i] = s.charCodeAt(i);  },
		readBytes  : function(buff,p,l){  var arr = [];   for(var i=0; i<l; i++) arr.push(buff[p+i]);   return arr;  },
		pad : function(n) { return n.length < 2 ? "0" + n : n; },
		readUTF8 : function(buff, p, l) {
			var s = "", ns;
			for(var i=0; i<l; i++) s += "%" + _bin.pad(buff[p+i].toString(16));
			try {  ns = decodeURIComponent(s); }
			catch(e) {  return _bin.readASCII(buff, p, l);  }
			return  ns;
		}
	}

	function toRGBA8(out)
	{
		var w = out.width, h = out.height;
		if(out.tabs.acTL==null) return [decodeImage(out.data, w, h, out).buffer];
		
		var frms = [];
		if(out.frames[0].data==null) out.frames[0].data = out.data;
		
		var len = w*h*4, img = new Uint8Array(len), empty = new Uint8Array(len), prev=new Uint8Array(len);
		for(var i=0; i<out.frames.length; i++)
		{
			var frm = out.frames[i];
			var fx=frm.rect.x, fy=frm.rect.y, fw = frm.rect.width, fh = frm.rect.height;
			var fdata = decodeImage(frm.data, fw,fh, out);
			
			if(i!=0) for(var j=0; j<len; j++) prev[j]=img[j];
			
			if     (frm.blend==0) _copyTile(fdata, fw, fh, img, w, h, fx, fy, 0);
			else if(frm.blend==1) _copyTile(fdata, fw, fh, img, w, h, fx, fy, 1);
			
			frms.push(img.buffer.slice(0));
			
			if     (frm.dispose==0) {}
			else if(frm.dispose==1) _copyTile(empty, fw, fh, img, w, h, fx, fy, 0);
			else if(frm.dispose==2) for(var j=0; j<len; j++) img[j]=prev[j];
		}
		return frms;
	}
	function decodeImage(data, w, h, out)
	{
		var area = w*h, bpp = _getBPP(out);
		var bpl = Math.ceil(w*bpp/8);	// bytes per line

		var bf = new Uint8Array(area*4), bf32 = new Uint32Array(bf.buffer);
		var ctype = out.ctype, depth = out.depth;
		var rs = _bin.readUshort;
		
		//console.log(ctype, depth);
		var time = Date.now();

		if     (ctype==6) { // RGB + alpha
			var qarea = area<<2;
			if(depth== 8) for(var i=0; i<qarea;i+=4) {  bf[i] = data[i];  bf[i+1] = data[i+1];  bf[i+2] = data[i+2];  bf[i+3] = data[i+3]; }
			if(depth==16) for(var i=0; i<qarea;i++ ) {  bf[i] = data[i<<1];  }
		}
		else if(ctype==2) {	// RGB
			var ts=out.tabs["tRNS"];
			if(ts==null) {
				if(depth== 8) for(var i=0; i<area; i++) {  var ti=i*3;  bf32[i] = (255<<24)|(data[ti+2]<<16)|(data[ti+1]<<8)|data[ti];  }
				if(depth==16) for(var i=0; i<area; i++) {  var ti=i*6;  bf32[i] = (255<<24)|(data[ti+4]<<16)|(data[ti+2]<<8)|data[ti];  }
			}
			else {  var tr=ts[0], tg=ts[1], tb=ts[2];
				if(depth== 8) for(var i=0; i<area; i++) {  var qi=i<<2, ti=i*3;  bf32[i] = (255<<24)|(data[ti+2]<<16)|(data[ti+1]<<8)|data[ti];
					if(data[ti]   ==tr && data[ti+1]   ==tg && data[ti+2]   ==tb) bf[qi+3] = 0;  }
				if(depth==16) for(var i=0; i<area; i++) {  var qi=i<<2, ti=i*6;  bf32[i] = (255<<24)|(data[ti+4]<<16)|(data[ti+2]<<8)|data[ti];
					if(rs(data,ti)==tr && rs(data,ti+2)==tg && rs(data,ti+4)==tb) bf[qi+3] = 0;  }
			}
		}
		else if(ctype==3) {	// palette
			var p=out.tabs["PLTE"], ap=out.tabs["tRNS"], tl=ap?ap.length:0;
			//console.log(p, ap);
			if(depth==1) for(var y=0; y<h; y++) {  var s0 = y*bpl, t0 = y*w;
				for(var i=0; i<w; i++) { var qi=(t0+i)<<2, j=((data[s0+(i>>3)]>>(7-((i&7)<<0)))& 1), cj=3*j;  bf[qi]=p[cj];  bf[qi+1]=p[cj+1];  bf[qi+2]=p[cj+2];  bf[qi+3]=(j<tl)?ap[j]:255;  }
			}
			if(depth==2) for(var y=0; y<h; y++) {  var s0 = y*bpl, t0 = y*w;
				for(var i=0; i<w; i++) { var qi=(t0+i)<<2, j=((data[s0+(i>>2)]>>(6-((i&3)<<1)))& 3), cj=3*j;  bf[qi]=p[cj];  bf[qi+1]=p[cj+1];  bf[qi+2]=p[cj+2];  bf[qi+3]=(j<tl)?ap[j]:255;  }
			}
			if(depth==4) for(var y=0; y<h; y++) {  var s0 = y*bpl, t0 = y*w;
				for(var i=0; i<w; i++) { var qi=(t0+i)<<2, j=((data[s0+(i>>1)]>>(4-((i&1)<<2)))&15), cj=3*j;  bf[qi]=p[cj];  bf[qi+1]=p[cj+1];  bf[qi+2]=p[cj+2];  bf[qi+3]=(j<tl)?ap[j]:255;  }
			}
			if(depth==8) for(var i=0; i<area; i++ ) {  var qi=i<<2, j=data[i]                      , cj=3*j;  bf[qi]=p[cj];  bf[qi+1]=p[cj+1];  bf[qi+2]=p[cj+2];  bf[qi+3]=(j<tl)?ap[j]:255;  }
		}
		else if(ctype==4) {	// gray + alpha
			if(depth== 8)  for(var i=0; i<area; i++) {  var qi=i<<2, di=i<<1, gr=data[di];  bf[qi]=gr;  bf[qi+1]=gr;  bf[qi+2]=gr;  bf[qi+3]=data[di+1];  }
			if(depth==16)  for(var i=0; i<area; i++) {  var qi=i<<2, di=i<<2, gr=data[di];  bf[qi]=gr;  bf[qi+1]=gr;  bf[qi+2]=gr;  bf[qi+3]=data[di+2];  }
		}
		else if(ctype==0) {	// gray
			var tr = out.tabs["tRNS"] ? out.tabs["tRNS"] : -1;
			for(var y=0; y<h; y++) {
				var off = y*bpl, to = y*w;
				if     (depth== 1) for(var x=0; x<w; x++) {  var gr=255*((data[off+(x>>>3)]>>>(7 -((x&7)   )))& 1), al=(gr==tr*255)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
				else if(depth== 2) for(var x=0; x<w; x++) {  var gr= 85*((data[off+(x>>>2)]>>>(6 -((x&3)<<1)))& 3), al=(gr==tr* 85)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
				else if(depth== 4) for(var x=0; x<w; x++) {  var gr= 17*((data[off+(x>>>1)]>>>(4 -((x&1)<<2)))&15), al=(gr==tr* 17)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
				else if(depth== 8) for(var x=0; x<w; x++) {  var gr=data[off+     x], al=(gr                 ==tr)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
				else if(depth==16) for(var x=0; x<w; x++) {  var gr=data[off+(x<<1)], al=(rs(data,off+(x<<1))==tr)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
			}
		}
		//console.log(Date.now()-time);
		return bf;
	}



	function decode(buff)
	{
		var data = new Uint8Array(buff), offset = 8, bin = _bin, rUs = bin.readUshort, rUi = bin.readUint;
		var out = {tabs:{}, frames:[]};
		var dd = new Uint8Array(data.length), doff = 0;	 // put all IDAT data into it
		var fd, foff = 0;	// frames
		
		var mgck = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		for(var i=0; i<8; i++) if(data[i]!=mgck[i]) throw "The input is not a PNG file!";

		while(offset<data.length)
		{
			var len  = bin.readUint(data, offset);  offset += 4;
			var type = bin.readASCII(data, offset, 4);  offset += 4;
			//console.log(type,len);
			
			if     (type=="IHDR")  {  _IHDR(data, offset, out);  }
			else if(type=="iCCP")  {
				var off = offset;  while(data[off]!=0) off++;
				var nam = bin.readASCII(data,offset,off-offset);
				var cpr = data[off+1];
				var fil = data.slice(off+2,offset+len);
				var res = null;
				try { res = _inflate(fil); } catch(e) {  res = inflateRaw(fil);  }
				out.tabs[type] = res;
			}
			else if(type=="CgBI")  {  out.tabs[type] = data.slice(offset,offset+4);  }
			else if(type=="IDAT") {
				for(var i=0; i<len; i++) dd[doff+i] = data[offset+i];
				doff += len;
			}
			else if(type=="acTL")  {
				out.tabs[type] = {  num_frames:rUi(data, offset), num_plays:rUi(data, offset+4)  };
				fd = new Uint8Array(data.length);
			}
			else if(type=="fcTL")  {
				if(foff!=0) {  var fr = out.frames[out.frames.length-1];
					fr.data = _decompress(out, fd.slice(0,foff), fr.rect.width, fr.rect.height);  foff=0;
				}
				var rct = {x:rUi(data, offset+12),y:rUi(data, offset+16),width:rUi(data, offset+4),height:rUi(data, offset+8)};
				var del = rUs(data, offset+22);  del = rUs(data, offset+20) / (del==0?100:del);
				var frm = {rect:rct, delay:Math.round(del*1000), dispose:data[offset+24], blend:data[offset+25]};
				//console.log(frm);
				out.frames.push(frm);
			}
			else if(type=="fdAT") {
				for(var i=0; i<len-4; i++) fd[foff+i] = data[offset+i+4];
				foff += len-4;
			}
			else if(type=="pHYs") {
				out.tabs[type] = [bin.readUint(data, offset), bin.readUint(data, offset+4), data[offset+8]];
			}
			else if(type=="cHRM") {
				out.tabs[type] = [];
				for(var i=0; i<8; i++) out.tabs[type].push(bin.readUint(data, offset+i*4));
			}
			else if(type=="tEXt" || type=="zTXt") {
				if(out.tabs[type]==null) out.tabs[type] = {};
				var nz = bin.nextZero(data, offset);
				var keyw = bin.readASCII(data, offset, nz-offset);
				var text, tl=offset+len-nz-1;
				if(type=="tEXt") text = bin.readASCII(data, nz+1, tl);
				else {
					var bfr = _inflate(data.slice(nz+2,nz+2+tl));
					text = bin.readUTF8(bfr,0,bfr.length);
				}
				out.tabs[type][keyw] = text;
			}
			else if(type=="iTXt") {
				if(out.tabs[type]==null) out.tabs[type] = {};
				var nz = 0, off = offset;
				nz = bin.nextZero(data, off);
				var keyw = bin.readASCII(data, off, nz-off);  off = nz + 1;
				var cflag = data[off], cmeth = data[off+1];  off+=2;
				nz = bin.nextZero(data, off);
				var ltag = bin.readASCII(data, off, nz-off);  off = nz + 1;
				nz = bin.nextZero(data, off);
				var tkeyw = bin.readUTF8(data, off, nz-off);  off = nz + 1;
				var text, tl=len-(off-offset);
				if(cflag==0) text  = bin.readUTF8(data, off, tl);
				else {
					var bfr = _inflate(data.slice(off,off+tl));
					text = bin.readUTF8(bfr,0,bfr.length);
				}
				out.tabs[type][keyw] = text;
			}
			else if(type=="PLTE") {
				out.tabs[type] = bin.readBytes(data, offset, len);
			}
			else if(type=="hIST") {
				var pl = out.tabs["PLTE"].length/3;
				out.tabs[type] = [];  for(var i=0; i<pl; i++) out.tabs[type].push(rUs(data, offset+i*2));
			}
			else if(type=="tRNS") {
				if     (out.ctype==3) out.tabs[type] = bin.readBytes(data, offset, len);
				else if(out.ctype==0) out.tabs[type] = rUs(data, offset);
				else if(out.ctype==2) out.tabs[type] = [ rUs(data,offset),rUs(data,offset+2),rUs(data,offset+4) ];
				//else console.log("tRNS for unsupported color type",out.ctype, len);
			}
			else if(type=="gAMA") out.tabs[type] = bin.readUint(data, offset)/100000;
			else if(type=="sRGB") out.tabs[type] = data[offset];
			else if(type=="bKGD")
			{
				if     (out.ctype==0 || out.ctype==4) out.tabs[type] = [rUs(data, offset)];
				else if(out.ctype==2 || out.ctype==6) out.tabs[type] = [rUs(data, offset), rUs(data, offset+2), rUs(data, offset+4)];
				else if(out.ctype==3) out.tabs[type] = data[offset];
			}
			else if(type=="IEND") {
				break;
			}
			//else {  console.log("unknown chunk type", type, len);  out.tabs[type]=data.slice(offset,offset+len);  }
			offset += len;
			var crc = bin.readUint(data, offset);  offset += 4;
		}
		if(foff!=0) {  var fr = out.frames[out.frames.length-1];
			fr.data = _decompress(out, fd.slice(0,foff), fr.rect.width, fr.rect.height);
		}	
		out.data = _decompress(out, dd, out.width, out.height);
		
		delete out.compress;  delete out.interlace;  delete out.filter;
		return out;
	}

	function _decompress(out, dd, w, h) {
		var time = Date.now();
		var bpp = _getBPP(out), bpl = Math.ceil(w*bpp/8), buff = new Uint8Array((bpl+1+out.interlace)*h);
		if(out.tabs["CgBI"]) dd = inflateRaw(dd,buff);
		else                 dd = _inflate(dd,buff);
		//console.log(dd.length, buff.length);
		//console.log(Date.now()-time);

		var time=Date.now();
		if     (out.interlace==0) dd = _filterZero(dd, out, 0, w, h);
		else if(out.interlace==1) dd = _readInterlace(dd, out);
		//console.log(Date.now()-time);
		return dd;
	}

	function _inflate(data, buff) {  var out=inflateRaw(new Uint8Array(data.buffer, 2,data.length-6),buff);  return out;  }
	
	var inflateRaw=function(){var D=function(){var o=Uint16Array,j=Uint32Array;return{m:new o(16),v:new o(16),
	d:[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],o:[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,999,999,999],
	z:[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0],B:new o(32),
	p:[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,65535,65535],
	w:[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0],h:new j(32),g:new o(512),s:[],A:new o(32),t:[],k:new o(32768),c:[],
	a:[],n:new o(32768),e:[],C:new o(512),b:[],i:new o(1<<15),r:new j(286),f:new j(30),l:new j(19),u:new j(15e3),q:new o(1<<16),j:new o(1<<15)}}();
function C(o,j){var I=o.length,A,r,i,y,G,f=D.v;for(var y=0;y<=j;y++)f[y]=0;for(y=1;y<I;y+=2)f[o[y]]++;
var a=D.m;A=0;f[0]=0;for(r=1;r<=j;r++){A=A+f[r-1]<<1;a[r]=A}for(i=0;i<I;i+=2){G=o[i+1];if(G!=0){o[i]=a[G];
a[G]++}}}function t(o,j,I){var A=o.length,r=D.i;for(var i=0;i<A;i+=2)if(o[i+1]!=0){var y=i>>1,G=o[i+1],f=y<<4|G,a=j-G,k=o[i]<<a,N=k+(1<<a);
while(k!=N){var x=r[k]>>>15-j;I[x]=f;k++}}}function g(o,j){var I=D.i,A=15-j;for(var r=0;r<o.length;r+=2){var i=o[r]<<j-o[r+1];
o[r]=I[i]>>>A}}(function(){var o=1<<15;for(var j=0;j<o;j++){var I=j;I=(I&2863311530)>>>1|(I&1431655765)<<1;
I=(I&3435973836)>>>2|(I&858993459)<<2;I=(I&4042322160)>>>4|(I&252645135)<<4;I=(I&4278255360)>>>8|(I&16711935)<<8;
D.i[j]=(I>>>16|I<<16)>>>17}function A(r,i,y){while(i--!=0)r.push(0,y)}for(var j=0;j<32;j++){D.B[j]=D.o[j]<<3|D.z[j];
D.h[j]=D.p[j]<<4|D.w[j]}A(D.s,144,8);A(D.s,255-143,9);A(D.s,279-255,7);A(D.s,287-279,8);C(D.s,9);t(D.s,9,D.g);
g(D.s,9);A(D.t,32,5);C(D.t,5);t(D.t,5,D.A);g(D.t,5);A(D.b,19,0);A(D.c,286,0);A(D.e,30,0);A(D.a,320,0)}());
function F(o,j,I){return(o[j>>>3]|o[(j>>>3)+1]<<8)>>>(j&7)&(1<<I)-1}function s(o,j,I){return(o[j>>>3]|o[(j>>>3)+1]<<8|o[(j>>>3)+2]<<16)>>>(j&7)&(1<<I)-1}
function w(o,j){return(o[j>>>3]|o[(j>>>3)+1]<<8|o[(j>>>3)+2]<<16)>>>(j&7)}function b(o,j){return(o[j>>>3]|o[(j>>>3)+1]<<8|o[(j>>>3)+2]<<16|o[(j>>>3)+3]<<24)>>>(j&7)}
function v(o,j){var I=Uint8Array,r=0,i=0,y=0,G=0,f=0,a=0,k=0,N=0,x=0,P,J;
if(o[0]==3&&o[1]==0)return j?j:new I(0);var A=j==null;if(A)j=new I(o.length>>>2<<3);while(r==0){r=s(o,x,1);
i=s(o,x+1,2);x+=3;if(i==0){if((x&7)!=0)x+=8-(x&7);var K=(x>>>3)+4,m=o[K-4]|o[K-3]<<8;if(A)j=H(j,N+m);
j.set(new I(o.buffer,o.byteOffset+K,m),N);x=K+m<<3;N+=m;continue}if(A)j=H(j,N+(1<<17));if(i==1){P=D.g;
J=D.A;a=(1<<9)-1;k=(1<<5)-1}if(i==2){y=F(o,x,5)+257;G=F(o,x+5,5)+1;f=F(o,x+10,4)+4;x+=14;var O=x,Q=1;
for(var p=0;p<38;p+=2){D.b[p]=0;D.b[p+1]=0}for(var p=0;p<f;p++){var l=F(o,x+p*3,3);D.b[(D.d[p]<<1)+1]=l;
if(l>Q)Q=l}x+=3*f;C(D.b,Q);t(D.b,Q,D.C);P=D.k;J=D.n;x=B(D.C,(1<<Q)-1,y+G,o,x,D.a);var u=d(D.a,0,y,D.c);
a=(1<<u)-1;var n=d(D.a,y,G,D.e);k=(1<<n)-1;C(D.c,u);t(D.c,u,P);C(D.e,n);t(D.e,n,J)}while(!0){var h=P[w(o,x)&a];
x+=h&15;var L=h>>>4;if(L>>>8==0){j[N++]=L}else if(L==256){break}else{var M=N+L-254;if(L>264){var z=D.B[L-257];
M=N+(z>>>3)+F(o,x,z&7);x+=z&7}var e=J[w(o,x)&k];x+=e&15;var E=e>>>4,c=D.h[E],q=(c>>>4)+s(o,x,c&15);x+=c&15;
if(A)j=H(j,N+(1<<17));while(N<M){j[N]=j[N++-q];j[N]=j[N++-q];j[N]=j[N++-q];j[N]=j[N++-q]}N=M}}}return j.length==N?j:j.slice(0,N)}function H(o,j){var I=o.length;
if(j<=I)return o;var A=new Uint8Array(Math.max(I<<1,j));A.set(o,0);return A}function B(o,j,I,A,r,i){var y=0;
while(y<I){var G=o[w(A,r)&j];r+=G&15;var f=G>>>4;if(f<=15){i[y]=f;y++}else{var a=0,k=0;if(f==16){k=3+F(A,r,2);
r+=2;a=i[y-1]}else if(f==17){k=3+F(A,r,3);r+=3}else if(f==18){k=11+F(A,r,7);r+=7}var N=y+k;while(y<N){i[y]=a;
y++}}}return r}function d(o,j,I,A){var r=0,i=0,y=A.length>>>1;while(i<I){var G=o[i+j];A[i<<1]=0;A[(i<<1)+1]=G;
if(G>r)r=G;i++}while(i<y){A[i<<1]=0;A[(i<<1)+1]=0;i++}return r}return v}();


	function _readInterlace(data, out)
	{
		var w = out.width, h = out.height;
		var bpp = _getBPP(out), cbpp = bpp>>3, bpl = Math.ceil(w*bpp/8);
		var img = new Uint8Array( h * bpl );
		var di = 0;

		var starting_row  = [ 0, 0, 4, 0, 2, 0, 1 ];
		var starting_col  = [ 0, 4, 0, 2, 0, 1, 0 ];
		var row_increment = [ 8, 8, 8, 4, 4, 2, 2 ];
		var col_increment = [ 8, 8, 4, 4, 2, 2, 1 ];

		var pass=0;
		while(pass<7)
		{
			var ri = row_increment[pass], ci = col_increment[pass];
			var sw = 0, sh = 0;
			var cr = starting_row[pass];  while(cr<h) {  cr+=ri;  sh++;  }
			var cc = starting_col[pass];  while(cc<w) {  cc+=ci;  sw++;  }
			var bpll = Math.ceil(sw*bpp/8);
			_filterZero(data, out, di, sw, sh);

			var y=0, row = starting_row[pass];
			while(row<h)
			{
				var col = starting_col[pass];
				var cdi = (di+y*bpll)<<3;

				while(col<w)
				{
					if(bpp==1) {
						var val = data[cdi>>3];  val = (val>>(7-(cdi&7)))&1;
						img[row*bpl + (col>>3)] |= (val << (7-((col&7)<<0)));
					}
					if(bpp==2) {
						var val = data[cdi>>3];  val = (val>>(6-(cdi&7)))&3;
						img[row*bpl + (col>>2)] |= (val << (6-((col&3)<<1)));
					}
					if(bpp==4) {
						var val = data[cdi>>3];  val = (val>>(4-(cdi&7)))&15;
						img[row*bpl + (col>>1)] |= (val << (4-((col&1)<<2)));
					}
					if(bpp>=8) {
						var ii = row*bpl+col*cbpp;
						for(var j=0; j<cbpp; j++) img[ii+j] = data[(cdi>>3)+j];
					}
					cdi+=bpp;  col+=ci;
				}
				y++;  row += ri;
			}
			if(sw*sh!=0) di += sh * (1 + bpll);
			pass = pass + 1;
		}
		return img;
	}

	function _getBPP(out) {
		var noc = [1,null,3,1,2,null,4][out.ctype];
		return noc * out.depth;
	}

	function _filterZero(data, out, off, w, h)
	{
		var bpp = _getBPP(out), bpl = Math.ceil(w*bpp/8);
		bpp = Math.ceil(bpp/8);
		
		var i,di, type=data[off], x=0;
		
		if(type>1) data[off]=[0,0,1][type-2];  
		if(type==3) for(x=bpp; x<bpl; x++) data[x+1] = (data[x+1] + (data[x+1-bpp]>>>1) )&255;

		for(var y=0; y<h; y++)  {
			i = off+y*bpl; di = i+y+1;
			type = data[di-1]; x=0;

			if     (type==0)   for(; x<bpl; x++) data[i+x] = data[di+x];
			else if(type==1) { for(; x<bpp; x++) data[i+x] = data[di+x];
							   for(; x<bpl; x++) data[i+x] = (data[di+x] + data[i+x-bpp]);  }
			else if(type==2) { for(; x<bpl; x++) data[i+x] = (data[di+x] + data[i+x-bpl]);  }
			else if(type==3) { for(; x<bpp; x++) data[i+x] = (data[di+x] + ( data[i+x-bpl]>>>1));
							   for(; x<bpl; x++) data[i+x] = (data[di+x] + ((data[i+x-bpl]+data[i+x-bpp])>>>1) );  }
			else             { for(; x<bpp; x++) data[i+x] = (data[di+x] + _paeth(0, data[i+x-bpl], 0));
							   for(; x<bpl; x++) data[i+x] = (data[di+x] + _paeth(data[i+x-bpp], data[i+x-bpl], data[i+x-bpp-bpl]) );  }
		}
		return data;
	}

	function _paeth(a,b,c)
	{
		var p = a+b-c, pa = (p-a), pb = (p-b), pc = (p-c);
		if (pa*pa <= pb*pb && pa*pa <= pc*pc)  return a;
		else if (pb*pb <= pc*pc)  return b;
		return c;
	}

	function _IHDR(data, offset, out)
	{
		out.width  = _bin.readUint(data, offset);  offset += 4;
		out.height = _bin.readUint(data, offset);  offset += 4;
		out.depth     = data[offset];  offset++;
		out.ctype     = data[offset];  offset++;
		out.compress  = data[offset];  offset++;
		out.filter    = data[offset];  offset++;
		out.interlace = data[offset];  offset++;
	}

	function _copyTile(sb, sw, sh, tb, tw, th, xoff, yoff, mode)
	{
		var w = Math.min(sw,tw), h = Math.min(sh,th);
		var si=0, ti=0;
		for(var y=0; y<h; y++)
			for(var x=0; x<w; x++)
			{
				if(xoff>=0 && yoff>=0) {  si = (y*sw+x)<<2;  ti = (( yoff+y)*tw+xoff+x)<<2;  }
				else                   {  si = ((-yoff+y)*sw-xoff+x)<<2;  ti = (y*tw+x)<<2;  }
				
				if     (mode==0) {  tb[ti] = sb[si];  tb[ti+1] = sb[si+1];  tb[ti+2] = sb[si+2];  tb[ti+3] = sb[si+3];  }
				else if(mode==1) {
					var fa = sb[si+3]*(1/255), fr=sb[si]*fa, fg=sb[si+1]*fa, fb=sb[si+2]*fa; 
					var ba = tb[ti+3]*(1/255), br=tb[ti]*ba, bg=tb[ti+1]*ba, bb=tb[ti+2]*ba; 
					
					var ifa=1-fa, oa = fa+ba*ifa, ioa = (oa==0?0:1/oa);
					tb[ti+3] = 255*oa;  
					tb[ti+0] = (fr+br*ifa)*ioa;  
					tb[ti+1] = (fg+bg*ifa)*ioa;   
					tb[ti+2] = (fb+bb*ifa)*ioa;  
				}
				else if(mode==2){	// copy only differences, otherwise zero
					var fa = sb[si+3], fr=sb[si], fg=sb[si+1], fb=sb[si+2]; 
					var ba = tb[ti+3], br=tb[ti], bg=tb[ti+1], bb=tb[ti+2]; 
					if(fa==ba && fr==br && fg==bg && fb==bb) {  tb[ti]=0;  tb[ti+1]=0;  tb[ti+2]=0;  tb[ti+3]=0;  }
					else {  tb[ti]=fr;  tb[ti+1]=fg;  tb[ti+2]=fb;  tb[ti+3]=fa;  }
				}
				else if(mode==3){	// check if can be blended
					var fa = sb[si+3], fr=sb[si], fg=sb[si+1], fb=sb[si+2]; 
					var ba = tb[ti+3], br=tb[ti], bg=tb[ti+1], bb=tb[ti+2]; 
					if(fa==ba && fr==br && fg==bg && fb==bb) continue;
					//if(fa!=255 && ba!=0) return false;
					if(fa<220 && ba>20) return false;
				}
			}
		return true;
	}
	
	return {
		decode:decode,
		toRGBA8:toRGBA8,
		_paeth:_paeth,
		_copyTile:_copyTile,
		_bin:_bin
	};

})();








export default UPNG;
