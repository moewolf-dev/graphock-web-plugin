import { createApp } from 'vue'
import App from './App.vue'
import { currentLocale } from '../shared/strings'

document.documentElement.lang = currentLocale() === 'zh' ? 'zh-CN' : 'en'

createApp(App).mount('#app')
