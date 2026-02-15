// components/ProfileCard.js
import React from "react";
import styled from "styled-components";

const Card = styled.div`
  background:#fff; border-radius:12px; padding:16px; box-shadow:0 1px 6px rgba(0,0,0,0.08);
  position:relative;
  
`;

 export const Banner = styled.img`
  width:100%; height:80px; object-fit:cover; border-radius:12px 12px 0 0;
`;

export const Avatar = styled.img`
width:100px; height:100px; border-radius:50%; border:3px solid #fff; position:absolute; top:50px; left:10%;
`;

const Divider = styled.hr`border:none; border-top:1px solid #e5e7eb; margin:10px 0;`;

export const Stats = styled.div``;
export const Stat = styled.div`color:#4b5563;display:flex;justify-content:space-between;font-weight:bold;font-size:0.9rem;`;
export const ProfileDetails = styled.div`
position: relative;
top:50px;
font-size:0.95rem;
`

export const Footer = styled.footer`
color:gray;
margin-left:5px;
`

export const UserName = styled.h2`
font-size: 1.5rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;  /* adjust for your layout */
`;

export default function ProfileCard() {
  return (
    <>
    <Card style={{height:"270px"}}>
      <Banner src="https://images.unsplash.com/photo-1751182782142-000e62239d85?q=80&w=1332&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" />
      <Avatar src="https://scontent-cdg4-3.xx.fbcdn.net/v/t39.30808-6/450395418_461503933475622_6296360950464922275_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeHI25HgywIQzsxl6-n4ZvPbFaNXayjELTUVo1drKMQtNaS09YVcMeT6sJCMXVkfAanZYCe_C1SC9o8GhJLwx3C5&_nc_ohc=kcqDLQxnkW0Q7kNvwHdvsP-&_nc_oc=AdnGTwNTnm5KiHPFIMNtNwAJZPkbsUuWkyqAYhq7-xpNeiZ5d8CUrBNYIzcyibQbrp8&_nc_zt=23&_nc_ht=scontent-cdg4-3.xx&_nc_gid=Dd1wKtsK7w6Alb0ioyP9Tw&oh=00_AfbSXlAVp-60ZaegsUpMBwQt64HcRzKDiDJFavWhgogspg&oe=68D611AC" />
      <ProfileDetails>
      <UserName>Emmanuel N. Nyanforh</UserName>
      <p>Student, Starz University</p>
      <p>Bachelor in Information Technology</p>
      <p>Monrovia Liberia</p>
      </ProfileDetails>
    </Card>

<Card style={{marginTop:"12px", marginBottom:"12px"}}>
      <Stats>
        <Stat>
            <div>Profile Viewers</div>
            <div>900</div>
        </Stat>
        {/* <Divided>
          <Line></Line>
        </Divided> */}
        <Stat style={{marginTop:"20px"}}>
            <div>Post Impression</div>
            <div>10k</div>
        </Stat>
      </Stats>
      </Card>
      
      <Footer>
        <p>Terms | Privacy | Help | Contact</p>
        <p>Brightway Corporation © 2025</p>
      </Footer>
      </>
  );
}
