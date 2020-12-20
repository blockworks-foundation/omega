import React from "react";
import "./App.less";
import GitHubButton from "react-github-btn";
import { Routes } from "./routes";

function App() {
  return (
    <div className="App">
      <div className="Banner">
        <div className="Banner-description">
          Omega is unaudited software. Use at your own risk.
        </div>
      </div>
      <Routes />
    {
      <div className="social-buttons">
        <GitHubButton
          href="https://github.com/blockworks-foundation/omega"
          data-color-scheme="no-preference: light; light: light; dark: light;"
          data-icon="octicon-star"
          data-size="large"
          data-show-count={true}
          aria-label="Star blockworks-foundation/omega on GitHub"
        >
          Star
        </GitHubButton>
        <GitHubButton
          href="https://github.com/blockworks-foundation/omega/fork"
          data-color-scheme="no-preference: light; light: light; dark: light;"
          data-size="large"
          aria-label="Fork blockworks-foundation/omega on GitHub"
        >
          Fork
        </GitHubButton>
      </div>
      }
    </div>
  );
}

export default App;
