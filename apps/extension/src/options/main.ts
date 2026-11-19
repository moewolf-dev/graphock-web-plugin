import { createApp } from 'vue'
import OptionsApp from './OptionsApp.vue'
import { currentLocale } from '../shared/strings'

document.documentElement.lang = currentLocale() === 'zh' ? 'zh-CN' : 'en'

createApp(OptionsApp).mount('#app')
