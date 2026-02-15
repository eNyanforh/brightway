import styled, { keyframes } from "styled-components";

const shake = keyframes`
  0% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
  100% { transform: translateX(0); }
`;

const StyledError = styled.p`
  color: #dc2626;
  font-size: 0.8rem;
  margin-top: 0.4rem;
  animation: ${({ $shake }) => ($shake ? `${shake} 0.4s ease` : "none")};
  opacity: ${({ show }) => (show ? 1 : 0)};
  transition: opacity 0.3s ease;
  height: ${({ show }) => (show ? "auto" : "0")};
  overflow: hidden;
`;

const ErrorMessage = ({ show, shake, children }) => {
  return <StyledError show={show} $shake={shake}>{children}</StyledError>;
};

export default ErrorMessage;
