// MessageBody.js
import React from "react";
import styled from "styled-components";
import { messagesData } from "./message";


export default function MessageBody({ messagesData }) {
  return (
    <Container>
      {/* Header */}
      <Header>
        <Avatar src={messagesData.user.avatar} />
        <UserInfo>
          <h3>{messagesData.user.name}</h3>
          <span>{messagesData.user.title}</span>
        </UserInfo>
      </Header>

      {/* Messages */}
      <MessagesArea>
        {messagesData.messages.map((msg, idx) => (
          <MessageBubble key={idx} isMine={msg.fromMe}>
            {msg.text}
          </MessageBubble>
        ))}
      </MessagesArea>

      {/* Input */}
      <InputArea>
        <Input placeholder="Type a message..." />
        <SendButton>Send</SendButton>
      </InputArea>
    </Container>
  );
}

// STYLES
const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
`;

const Avatar = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin-right: 12px;
`;

const UserInfo = styled.div`
  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  span {
    font-size: 0.85rem;
    color: #6b7280;
  }
`;

const MessagesArea = styled.div`
  flex: 1;
  padding: 12px;
  background: #f9fafb;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MessageBubble = styled.div`
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 0.9rem;
  background: ${({ isMine }) => (isMine ? "#2563eb" : "#e5e7eb")};
  color: ${({ isMine }) => (isMine ? "#fff" : "#111827")};
  align-self: ${({ isMine }) => (isMine ? "flex-end" : "flex-start")};
`;

const InputArea = styled.div`
  display: flex;
  padding: 12px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
`;

const Input = styled.input`
  flex: 1;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 20px;
  font-size: 0.9rem;
  margin-right: 8px;
`;

const SendButton = styled.button`
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 20px;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 500;

  &:hover {
    background: #1d4ed8;
  }
`;
