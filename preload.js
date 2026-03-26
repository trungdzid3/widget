'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetMeta', {
    version: '1.1.1',
    getIpLocation: () => ipcRenderer.invoke('get-ip-location')
});
