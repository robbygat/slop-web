import React, {useEffect} from 'react';
import Connect from './Connect.jsx';

// Bookmarked creation links hand off to the MCP workflow. No browser-side
// authoring session, model selection, generation, or paid run is started.
export default function Build() {
  useEffect(() => { location.replace('#/connect'); }, []);
  return <Connect params={new URLSearchParams()}/>;
}
