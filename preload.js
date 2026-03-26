'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetMeta', {
    version: '1.1.2',
    getIpLocation: () => ipcRenderer.invoke('get-ip-location')
});
