import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from './auth.jsx';
import App from './App.jsx';
import './styles.css';
import './redesign.css';
class ErrorBoundary extends React.Component{
 state={error:null};static getDerivedStateFromError(error){return {error};}
 render(){return this.state.error?<main className="fatal"><img src="/assets/mobile/characters/ghost-mint.webp" width="160" alt="Slop"/><h1>A little wobble.</h1><p>Something interrupted Slop. Your saved games are safe.</p><button className="button" onClick={()=>location.reload()}>Reload Slop</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><AuthProvider><App/></AuthProvider></ErrorBoundary>);
