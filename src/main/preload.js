'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
    version: '1.1.2',
    getIpLocation: () => ipcRenderer.invoke('get-ip-location')
};

try {
    contextBridge.exposeInMainWorld('widgetMeta', api);
} catch (e) {
    window.widgetMeta = api;
}
