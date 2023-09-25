import React, { useState, FC } from "react";

type UI = React.ReactNode;

export class Proxy {
  content: UI | null = null;
  setContent: React.Dispatch<React.SetStateAction<UI | null>> = () => {};

  render() {
    const Element: FC = () => {
      [this.content, this.setContent] = useState<UI | null>(null);

      if (this.content === null) {
        return null;
      } else {
        return <>{this.content}</>;
      }
    };

    return <Element />;
  }
}
