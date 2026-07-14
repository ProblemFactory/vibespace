// Unit tests for src/lib/eml.js — run: node scripts/test-eml.mjs
import { parseEml } from '../src/lib/eml.js';

let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log('✓ ' + name);
  } else {
    failed++;
    console.error('✗ ' + name + (detail !== undefined ? ' — got: ' + JSON.stringify(detail) : ''));
  }
}
function section(name, fn) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error('✗ ' + name + ' — threw: ' + (e && e.stack || e));
  }
}
const crlf = (s) => s.replace(/\n/g, '\r\n');

// ---- 1. simple plain text ---------------------------------------------------
section('simple', () => {
  const eml = crlf(`From: Alice <alice@example.com>
To: bob@example.com
Subject: Hello
Date: Mon, 1 Jan 2024 10:00:00 +0000
Message-ID: <abc123@example.com>

Hello world!
`);
  const r = parseEml(eml);
  check('simple: from', r.headers.from === 'Alice <alice@example.com>', r.headers.from);
  check('simple: subject', r.headers.subject === 'Hello', r.headers.subject);
  check('simple: cc is empty string when absent', r.headers.cc === '', r.headers.cc);
  check('simple: messageId', r.headers.messageId === '<abc123@example.com>', r.headers.messageId);
  check('simple: textBody', r.textBody.trim() === 'Hello world!', r.textBody);
  check('simple: htmlBody null', r.htmlBody === null, r.htmlBody);
  check('simple: no attachments', r.attachments.length === 0, r.attachments.length);
  check('simple: allHeaders order + count',
    r.allHeaders.length === 5 && r.allHeaders[0][0] === 'From' && r.allHeaders[4][0] === 'Message-ID',
    r.allHeaders.map((h) => h[0]));
  // ArrayBuffer input path
  const buf = new TextEncoder().encode(eml);
  const r2 = parseEml(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  check('simple: ArrayBuffer input', r2.headers.subject === 'Hello', r2.headers.subject);
});

// ---- 2. multipart/alternative -----------------------------------------------
section('alternative', () => {
  const eml = crlf(`From: a@example.com
To: b@example.com
Subject: alt
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="b1"

This is the preamble and must be ignored.
--b1
Content-Type: text/plain; charset=utf-8

plain version
--b1
Content-Type: text/html; charset=utf-8

<p>html version</p>
--b1--
This is the epilogue and must be ignored.
`);
  const r = parseEml(eml);
  check('alternative: text part', r.textBody.trim() === 'plain version', r.textBody);
  check('alternative: html part', r.htmlBody.trim() === '<p>html version</p>', r.htmlBody);
  check('alternative: no attachments', r.attachments.length === 0, r.attachments.length);
  check('alternative: preamble ignored', r.textBody.indexOf('preamble') === -1, r.textBody);
});

// ---- 3. nested multipart/mixed + base64 attachment round-trip -----------------
section('nested mixed', () => {
  const pdfBytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) pdfBytes[i] = i;
  const b64 = Buffer.from(pdfBytes).toString('base64').match(/.{1,40}/g).join('\r\n');
  const eml = crlf(`From: a@example.com
Subject: mixed
Content-Type: multipart/mixed; boundary=outer

--outer
Content-Type: multipart/alternative; boundary=inner

--inner
Content-Type: text/plain; charset=utf-8

nested text
--inner
Content-Type: text/html; charset=utf-8

<b>nested html</b>
--inner--
--outer
Content-Type: application/pdf; name="doc.pdf"
Content-Disposition: attachment; filename="doc.pdf"
Content-Transfer-Encoding: base64

`) + b64 + crlf(`
--outer--
`);
  const r = parseEml(new TextEncoder().encode(eml)); // Uint8Array input path
  check('nested: text from inner alternative', r.textBody.trim() === 'nested text', r.textBody);
  check('nested: html from inner alternative', r.htmlBody.trim() === '<b>nested html</b>', r.htmlBody);
  check('nested: one attachment', r.attachments.length === 1, r.attachments.length);
  const att = r.attachments[0] || {};
  check('nested: attachment filename', att.filename === 'doc.pdf', att.filename);
  check('nested: attachment mime', att.mime === 'application/pdf', att.mime);
  check('nested: attachment size', att.size === 256, att.size);
  check('nested: content bytes round-trip',
    att.content instanceof Uint8Array && att.content.length === 256 && att.content.every((b, i) => b === i));
});

// ---- 4. quoted-printable UTF-8 body -------------------------------------------
section('quoted-printable', () => {
  const eml = crlf(`From: a@example.com
Subject: qp
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

=E4=B8=AD=E6=96=87 first line=
 continues here
`);
  const r = parseEml(eml);
  check('qp: CJK + soft line break', r.textBody.trim() === '中文 first line continues here', r.textBody);
});

// ---- 5. RFC 2047 encoded-word headers ------------------------------------------
section('rfc2047', () => {
  const subjB64 = Buffer.from('中文主题', 'utf8').toString('base64');
  const eml = crlf(`From: =?ISO-8859-1?Q?Andr=E9_Bj=F8rn?= <andre@example.com>
To: b@example.com
Subject: =?UTF-8?B?${subjB64}?=
X-Multi: =?UTF-8?Q?hello_?= =?UTF-8?Q?world?=

body
`);
  const r = parseEml(eml);
  check('rfc2047: B-encoded UTF-8 subject', r.headers.subject === '中文主题', r.headers.subject);
  check('rfc2047: Q-encoded ISO-8859-1 from (underscore = space)',
    r.headers.from === 'André Bjørn <andre@example.com>', r.headers.from);
  const multi = (r.allHeaders.find((h) => h[0].toLowerCase() === 'x-multi') || [])[1];
  check('rfc2047: adjacent encoded-words joined', multi === 'hello world', multi);
});

// ---- 6. GBK charset body (string input with 8-bit escapes) ---------------------
section('gbk', () => {
  // '中文' in GB2312/GBK: D6 D0 CE C4
  const eml = 'From: a@example.com\r\nSubject: gbk\r\n' +
    'Content-Type: text/plain; charset=gb2312\r\n\r\n\xD6\xD0\xCE\xC4\r\n';
  const r = parseEml(eml);
  check('gbk: body decoded via charset param', r.textBody.trim() === '中文', r.textBody);
});

// ---- 7. RFC 2231 filenames ------------------------------------------------------
section('rfc2231', () => {
  const nameB64 = Buffer.from('图表.dat', 'utf8').toString('base64');
  const eml = crlf(`From: a@example.com
Subject: rfc2231
Content-Type: multipart/mixed; boundary=bb

--bb
Content-Type: text/plain

body
--bb
Content-Type: application/octet-stream
Content-Disposition: attachment; filename*=UTF-8''%E4%B8%AD%E6%96%87%20report.txt

AAAA
--bb
Content-Type: application/octet-stream
Content-Disposition: attachment; filename*0*=UTF-8''%E6%8A%A5; filename*1*=%E5%91%8A.bin
Content-Transfer-Encoding: base64

aGVsbG8=
--bb
Content-Type: application/octet-stream; name="=?UTF-8?B?${nameB64}?="
Content-Disposition: attachment

xyz
--bb--
`);
  const r = parseEml(eml);
  check('rfc2231: three attachments', r.attachments.length === 3, r.attachments.length);
  const [a0, a1, a2] = r.attachments;
  check('rfc2231: single-segment extended filename', a0 && a0.filename === '中文 report.txt', a0 && a0.filename);
  check('rfc2231: passthrough content', a0 && a0.size === 4 && String.fromCharCode(...a0.content) === 'AAAA');
  check('rfc2231: continuation filename*0*/1*', a1 && a1.filename === '报告.bin', a1 && a1.filename);
  check('rfc2231: base64 attachment content', a1 && String.fromCharCode(...a1.content) === 'hello');
  check('rfc2231: RFC2047 word in plain name= param', a2 && a2.filename === '图表.dat', a2 && a2.filename);
  check('rfc2231: textBody still chosen from mixed', r.textBody.trim() === 'body', r.textBody);
});

// ---- 8. bare-LF message ----------------------------------------------------------
section('bare-lf', () => {
  const eml = 'From: lf@example.com\nSubject: bare\n\t lf folded\n' +
    'Content-Type: multipart/alternative; boundary=zz\n\n' +
    '--zz\nContent-Type: text/plain\n\nlf body\n' +
    '--zz\nContent-Type: text/html\n\n<i>lf html</i>\n--zz--\n';
  const r = parseEml(eml);
  check('bare-lf: folded subject unfolds', r.headers.subject === 'bare lf folded', r.headers.subject);
  check('bare-lf: text part', r.textBody.trim() === 'lf body', r.textBody);
  check('bare-lf: html part', r.htmlBody.trim() === '<i>lf html</i>', r.htmlBody);
});

// ---- 9. attachment without filename ----------------------------------------------
section('unnamed attachment', () => {
  const eml = crlf(`From: a@example.com
Subject: unnamed
Content-Type: multipart/mixed; boundary=qq

--qq
Content-Type: text/plain

hi
--qq
Content-Type: application/octet-stream
Content-Disposition: attachment
Content-Transfer-Encoding: base64

3q2+7w==
--qq--
`);
  const r = parseEml(eml);
  const att = r.attachments[0] || {};
  check('unnamed: one attachment', r.attachments.length === 1, r.attachments.length);
  check('unnamed: named part-1.bin', att.filename === 'part-1.bin', att.filename);
  check('unnamed: bytes decoded', att.size === 4 &&
    att.content[0] === 0xde && att.content[1] === 0xad && att.content[2] === 0xbe && att.content[3] === 0xef);
});

// ---- 10. message with no body -----------------------------------------------------
section('no body', () => {
  const r = parseEml('From: x@example.com\r\nSubject: nobody');
  check('no body: subject parsed', r.headers.subject === 'nobody', r.headers.subject);
  check('no body: empty textBody', r.textBody === '', r.textBody);
  check('no body: no attachments', r.attachments.length === 0, r.attachments.length);
});

// -----------------------------------------------------------------------------------
if (failed) {
  console.error(failed + ' check(s) failed');
  process.exit(1);
}
console.log('all green');
