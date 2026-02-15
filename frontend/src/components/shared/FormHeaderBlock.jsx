import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import { Logo } from "./Layout";

const FormLogo = styled(Logo)`
  font-size: 2.2rem;
  color: #3B82F6;
  display:flex;
  align-items:center;
  justify-content:center;

  img{
  width:55px;
  height:54px;
  }


`;

const TagLine = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  color: #6b7280;
  margin-top: 0.3rem;
`;

const PageTitle = styled.h4`
  margin-top: 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  
`;

const SubTitle = styled.p`
margin-top:10px;
width:300px;
text-align:center;
margin-left:auto;
margin-right:auto;
`

export default function FormHeaderBlock({ title, subTitle }) {
  return (
    <div style={{ textAlign: "center", marginBottom: "1.2rem" }}>
      <Link to="/" style={{ textDecoration: "none" }}>
        <FormLogo>
          <img src="/logo/brightwaylogo.png" alt="BrightWay Logo" />
        </FormLogo>
      </Link>
      <PageTitle>{title}</PageTitle>
      <SubTitle>{subTitle}</SubTitle>
    </div>
  );
}
