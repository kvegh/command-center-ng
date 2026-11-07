import React from 'react';
import type { ChatColour } from './browser-workspace';

const colours: ChatColour[] = ['cyan', 'violet', 'green', 'amber'];

export function ChatHeader({ id, name, colour, changeColour, children }: {
  id: string; name: string; colour: ChatColour; changeColour: (id: string, colour: ChatColour) => void; children?: React.ReactNode;
}) {
  return <header className="chat-header" data-chat-colour={colour}>
    <div className="chat-heading">
      <span className="chat-colour-marker" aria-hidden="true" />
      <h2 title={name}>{name}</h2>
      <select aria-label={`Colour for ${name}`} title="Choose a colour to identify this chat" value={colour} onChange={event => {
        const next = event.target.value as ChatColour;
        if (colours.includes(next)) changeColour(id, next);
      }}>{colours.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select>
    </div>
    {children}
  </header>;
}
