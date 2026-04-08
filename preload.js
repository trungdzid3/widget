'use strict';

const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('widgetMeta', {
    version: '1.1.2',
    getIpLocation: () => ipcRenderer.invoke('get-ip-location'),
    getCalendarEvents: (viewType) => ipcRenderer.invoke('get-calendar-events', viewType),
    openExternal: (url) => shell.openExternal(url),
    resizeWeather: (h) => ipcRenderer.send('resize-weather', h),
    broadcastWeather: (data) => ipcRenderer.send('weather-update', data),
    onWeatherImpact: (callback) => ipcRenderer.on('weather-impact', (e, data) => callback(data)),
    fetchAppleCalendar: (url) => ipcRenderer.invoke('fetch-apple-calendar', url)
});
