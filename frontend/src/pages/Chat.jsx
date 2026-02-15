// Opportunities.js
import React from "react";
import BrightWayLayout from "../components/BrightwayLayout";
import styled from "styled-components";
import { AvatarSmall } from "../components/Post";
import { FollowButton, CardContainer, FollowCard } from "./Network";
import { FollowInfo } from "./Network";
// import { ViewMoreButton } from "../components/RightSidebar";
import { ChevronDown } from "lucide-react";
// import { flex } from "@mui/system";
import { Link } from "react-router-dom";
import { SidebarItem,SidebarHeader, SidebarList,SidebarCard } from "./Network";
import { useState } from "react";
import { Tab, TabBar } from "./Network";
import { UserName, Stat, Stats, Footer, Banner, Avatar, ProfileDetails } from "../components/ProfileCard";
// import countryList from "react-select-country-list";
import SearchBox from "../components/shared/SearchBox";
import BuildCampusButton from "../components/shared/BuildButton";
import { messagesData } from "../components/shared/message";
import MessageBody from "../components/shared/MessageBody";



export default function Chat() {
   const [mainView, setMainView] = useState("discover");
  
  const leftSidebar = (
    <>
    <SidebarCard style={{height:"85vh", width:"119%"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"
        }}>
      <SidebarTitle>Chats</SidebarTitle>
      <NavIcons style={{display:"flex", gap:"10px"}}>
        <div>
        <img src="/icons/plus-black.png" height={25}/>
        </div>
        <div>
            <img src="/icons/camara-black.png"/>
        </div>
      </NavIcons>
      </div>
      <div style={{marginBottom:"10px"}}>
      <ChatSearch placeholder="Search..."/>
      </div>
      <TabBar style={{marginBottom:"20px", justifyContent:"space-between"}}>
          <div style={{display:"flex", gap:"10px"}}>
          <Tab active={mainView === "discover"} onClick={() => setMainView("discover")}>
            All DMs
          </Tab>
          <Tab active={mainView === "manage"} onClick={() => setMainView("manage")}>
            Unread
          </Tab>
          <Tab active={mainView === "manage"} onClick={() => setMainView("manage")}>
            Groups
          </Tab>
          </div>
        </TabBar>
      <SidebarList>
        {messagesData.map(msg =>(
              <MessagesList key={msg.id} unread={!msg.read}>

                <UserAvatar src={msg.sender.avatar}/>
                <FollowInfo style={{marginLeft:"10px"}}>
                  
              <h4>{msg.sender.name}</h4>
              <h5 style={{fontWeight:"400", marginTop:"4px", color:"gray"
              }}>{msg.preview}</h5>              
            </FollowInfo>
            <MoreDetails>
            <p style={{fontWeight:"400"
            }}>{msg.time}</p>
            </MoreDetails>
            </MessagesList>
        ))}
      </SidebarList>
    </SidebarCard>

    {/* <>
        <Card style={{height:"270px", marginTop:"20px"}}>
          <Banner src="https://images.unsplash.com/photo-1751182782142-000e62239d85?q=80&w=1332&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" />
          <ProfileAvatar src="https://scontent-cdg4-3.xx.fbcdn.net/v/t39.30808-6/450395418_461503933475622_6296360950464922275_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeHI25HgywIQzsxl6-n4ZvPbFaNXayjELTUVo1drKMQtNaS09YVcMeT6sJCMXVkfAanZYCe_C1SC9o8GhJLwx3C5&_nc_ohc=kcqDLQxnkW0Q7kNvwHdvsP-&_nc_oc=AdnGTwNTnm5KiHPFIMNtNwAJZPkbsUuWkyqAYhq7-xpNeiZ5d8CUrBNYIzcyibQbrp8&_nc_zt=23&_nc_ht=scontent-cdg4-3.xx&_nc_gid=Dd1wKtsK7w6Alb0ioyP9Tw&oh=00_AfbSXlAVp-60ZaegsUpMBwQt64HcRzKDiDJFavWhgogspg&oe=68D611AC" />
          <ProfileDetails>
          <UserName>Emmanuel N. Nyanforh</UserName>
          <p>Student, Starz University</p>
          <p>Bachelor in Information Technology</p>
          <p>Monrovia Liberia</p>
          </ProfileDetails>
        </Card>
    
   
          
          <Footer style={{marginTop:"10px"}}>
            <p>Terms | Privacy | Help | Contact</p>
            <p>Brightway Corporation © 2025</p>
          </Footer>
          </> */}
          </>
  );
  const mainContent = (
    <>
    <Card style={{height:"85vh", width:"100%",marginLeft:"40px"}}>
      
      </Card> 
    </>
  );
  const rightSidebar = (
      <CardContainer style={{marginLeft:"22px", height:"85vh", width:"89%"}}>
        <Card style={{height:"85vh"}}>
          
          
        </Card>
      </CardContainer>
    );

  return <BrightWayLayout leftSidebar={leftSidebar} mainContent={mainContent} rightSidebar={rightSidebar}/>;
}


const Card = styled.div`background:#fff; padding:16px; border-radius:12px; box-shadow:0 1px 4px rgba(0,0,0,0.1); h2,h3{ margin-bottom:8px; font-weight:600; } ul{ margin-top:8px; font-size:0.9rem; color:#4b5563; } 
li{ margin-bottom:4px; }

h5{
font-weight:400;
}`;
const CardHeader = styled.h2`
  display: flex;
  gap: 6px;
  font-size: 1rem;
  margin-bottom: 15px;
  font-weight: 600;
  color: #0f172a;
`;

const UserAvatar = styled(AvatarSmall)`
border-radius:50%;
width:45px;
height:45px;
`
const PriceDescription = styled.p`
padding:0;
`

const MoreDetails = styled(FollowInfo)`
display:flex;
flex-direction:column;
justify-content:center;
align-items:end;
`
const Works = styled(Card)`
background: linear-gradient(135deg, #a1c4fd 0%, #f9c2fbff 100%)
`
const Scholarships = styled(Works)`
 background: linear-gradient(135deg, #f3ff9aff 0%, #fad0c4 100%)
 
`

const Grants = styled(Card)`
background: linear-gradient(135deg, #43e97b 0%, #dcf93881 100%);
`;
const Challenges = styled(Card)`
 background: linear-gradient(135deg, #e2f39dff, #67b4f3ff); 
`


const Body = styled.main` display:flex; flex:1; gap:40px; padding:20px;justify-content:center;font-family:"Inter";`;
const Sidebar = styled.aside` width:20%; display:none; @media(min-width:1024px){ display:block; } `;
const MainFeed = styled.section` flex:1; max-width:600px; display:flex; flex-direction:column; gap:16px; `;

const ProfileAvatar = styled(Avatar)`
top: 460px;
`;

const ChatSearch = styled(SearchBox)`
color:red;
`
const SidebarTitle = styled(SidebarHeader)`
font-size:1.9rem;

margin-bottom:5px;
margin-left:2px;
margin-top:0;
font-family:"Inter";
`
const NavIcons = styled.div`
img{
width:25px;
height:25px
}
`;

const MessagesList = styled(SidebarItem)`
justify-content:center;
align-items:center;
background: ${({ unread }) => (unread ? "#e0f2fe" : "#fff")}; 
  /* light blue for unread, white for read */

  &:hover {
    background: ${({ unread }) => (unread ? "#dbeafe" : "#f9fafb")}; 
  }
h4, h5{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px; /* adjust depending on sidebar/main width */
};

h5{
max-width:140px;
}

`