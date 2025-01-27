import { Provider } from 'react-redux'
import { store } from './store/store'
import { Popup } from './components/popup/Popup'

export function App() {
  return (
    <Provider store={store}>
      <Popup />
    </Provider>
  )
}

export default App