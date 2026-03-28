'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetMeta', {
    version: '1.1.2',
    getIpLocation: () => ipcRenderer.invoke('get-ip-location'),
    resizeWeather: (h) => ipcRenderer.send('resize-weather', h),
    broadcastWeather: (data) => ipcRenderer.send('weather-update', data),
    onWeatherImpact: (callback) => ipcRenderer.on('weather-impact', (e, data) => callback(data))
});
