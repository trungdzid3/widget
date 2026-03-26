'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('widgetMeta', {
    version: '1.1.0'
});
