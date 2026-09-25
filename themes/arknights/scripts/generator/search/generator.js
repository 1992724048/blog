'use strict';

const {
  captureSearchSnapshot,
  repairSearchSnapshots
} = require('./snapshot');

hexo.extend.filter.register('after_post_render', function (data) {
  captureSearchSnapshot(hexo, data);
  return data;
}, 1100);

hexo.extend.filter.register('before_generate', function () {
  return repairSearchSnapshots(hexo);
}, 20);

hexo.extend.generator.register('json', function (locals) {
  if (!hexo.theme.config.search.enable) {
    return {}
  }
  const config = Object.assign({
    root: hexo.config.root,
    path: 'search.json',
    field: 'post',
    content: true,
    format: 'striptags'
  }, hexo.theme.config.search);
  const database = require('./database')(locals, config, hexo);
  return {
    path: config.path,
    data: JSON.stringify(database)
  };
});
