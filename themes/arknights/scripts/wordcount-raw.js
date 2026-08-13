// 字数统计 helper：与 hexo-wordcount 统计口径一致，但返回完整数字（不带 k 缩写）
const { stripHTML } = require('hexo-util');

hexo.extend.helper.register('wordcountRaw', function (content) {
  const stripped = stripHTML(content);
  const cn = (stripped.match(/[\u4E00-\u9FA5]/g) || []).length;
  const en = (stripped
    .replace(/[\u4E00-\u9FA5]/g, '')
    .match(/[a-zA-Z0-9_\u0392-\u03c9\u0400-\u04FF]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|[\u00E4\u00C4\u00E5\u00C5\u00F6\u00D6]+|\w+/g) || []).length;
  return cn + en;
});
