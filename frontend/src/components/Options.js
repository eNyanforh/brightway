
import styled from "styled-components";
const Options = styled.ul`
  list-style: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 1rem;
  width:100%;

  li {
    padding: 0.8rem;
    border-radius: 30px;
    border: 2px solid rgba(217, 217, 217, 0.4);
    width: 100%;
    margin-bottom: 0.75rem;
    background-color: rgba(217, 217, 217, 0.4);
    color: #3B82F6;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    text-align: center;
    transition: all 0.3s;

    &:hover {
      border-color: #e0e7ff;
      background-color: #e0e7ff;
    }

    &.selected {
      border-color: #3b82f6;
      background-color: #eff6ff;
    }
  }
`;

export default Options;
