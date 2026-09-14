import {createApp} from './app.mjs'
import {githubAuth} from './auth.mjs'
export {Library} from './library.mjs'
export {AuthSession} from './auth.mjs'
export default createApp(githubAuth())
