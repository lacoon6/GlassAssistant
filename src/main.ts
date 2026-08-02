import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { App } from './app'

const bridge = await waitForEvenAppBridge()
const app = new App(bridge)

await app.start()
