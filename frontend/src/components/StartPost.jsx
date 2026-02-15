import React from "react";
import styled from "styled-components";
import { FaRegImage, FaTrophy, FaQuestionCircle } from "react-icons/fa";

export default function PostActionsBar({ onSharePost, onAddAchievement, onAskQuestion }) {
  return (
    <Container>
      <ActionButton onClick={onSharePost}>
        <IconCircle bg="#e0f2fe" color="#0284c7">
          <FaRegImage size={20} />
        </IconCircle>
        <span>Share a Post</span>
      </ActionButton>

      <ActionButton onClick={onAddAchievement}>
        <IconCircle bg="#fef3c7" color="#d97706">
          <FaTrophy size={20} />
        </IconCircle>
        <span>Add an Achievement</span>
      </ActionButton>

      <ActionButton onClick={onAskQuestion}>
        <IconCircle bg="#f3e8ff" color="#9333ea">
          <FaQuestionCircle size={20} />
        </IconCircle>
        <span>Ask a Question</span>
      </ActionButton>
    </Container>
  );
}

/* Styled Components */
const Container = styled.div`
  display: flex;
  justify-content: space-around;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  margin-bottom: 16px;

  span{
  font-weight:bold;
  }
`;

const ActionButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  font-family:"Inter";
  color: #374151;
  transition: color 0.2s;
  

  &:hover {
    color: #2563eb;
  }
`;

const IconCircle = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${({ bg }) => bg || "#f3f4f6"};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ color }) => color || "#2563eb"};
  transition: background 0.2s, transform 0.2s;

  ${ActionButton}:hover & {
    transform: scale(1.05);
  }
`;
