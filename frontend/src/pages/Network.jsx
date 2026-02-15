// Network.js
import React, { useState } from "react";
import styled, { css } from "styled-components";
import BrightWayLayout from "../components/BrightwayLayout";
import { AvatarSmall } from "../components/Post";
import { Link } from "react-router-dom";
import { Banner, Avatar, ProfileDetails, UserName } from "../components/ProfileCard";


// Sample data
const data = [
  {
    id: 1,
    user: { name: "Sir George Mulbah Jr.", headline: "CEO at BITS", avatar: "https://media.licdn.com/dms/image/v2/D4E03AQE9sp3Sqv5oUw/profile-displayphoto-shrink_800_800/B4EZVh6lF_HgAg-/0/1741104502020?e=1761177600&v=beta&t=MXc8As3fFy-x1QiILbt_ZEu5BD0RVaexohXKz5cWBHg" },
    time: "2h",
    text: "The array has been rotated (clockwise) k times; find k or the ‘Rotation Count’.",
    image: "https://media.licdn.com/dms/image/v2/D4E22AQH9RydzuxiDYw/feedshare-shrink_2048_1536/B4EZj_HiVkGcAw-/0/1756626823691?e=1761177600&v=beta&t=KUy0Zxzk7DWaW3fkw71gToBb7CkSmRnzHMD2gL8ES-g",
  },
  {
    id: 2,
    user: { name: "Mohammed Konneh", headline: "Graduate Research Student in Chemistry", avatar: "https://media.licdn.com/dms/image/v2/D4D03AQH3T_xCV876vA/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1728243067125?e=1761177600&v=beta&t=5Z1mRg6vQy0rJHtbRHwICH71dKuug28A7RUdZR-Rs3s", country:"Monrovia, Liberia" },
    time: "5h",
    text: "AI is reshaping the future of work. Here are my thoughts on what’s next...",
    image: "https://media.licdn.com/dms/image/v2/C562DAQFTEKiGVRmQnQ/profile-treasury-image-shrink_1920_1920/profile-treasury-image-shrink_1920_1920/0/1635041493072?e=1759183200&v=beta&t=1acaE3fYY_xVKeAoEvEeLpizDaRU8_PczFBPj2BGDic",
  },
];

const connections = [
  { name: "John Smith", role: "Software Engineer", avatar: "https://randomuser.me/api/portraits/men/32.jpg", country:"United States of America" },
  { name: "Mary Johnson", role: "UI/UX Designer", avatar: "https://randomuser.me/api/portraits/women/44.jpg",country: "United Kindom" },
  { name: "Ali Konneh", role: "Data Analyst", avatar: "https://randomuser.me/api/portraits/men/53.jpg", country: "South Africa" },
  
];

const organizations = [
  { name: "Orange Liberia", title: "Telecommunication Company", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/385907883_703123241862339_276271654671645478_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeHgLCwRbReeI4TY1-9G90V9skJXFhXwGwOyQlcWFfAbA5stSb7eeJv3Tl8f1yH-dYZGnDc7fMJp9Ti4oe7nnroG&_nc_ohc=HAEmHNx94u0Q7kNvwHKJG17&_nc_oc=AdmqW1gnHasDR8WRYM4a13i_-rlevpu5_8sPrCGr-v15Q_bqMFbWM-yHfGQXWz_AOXk&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=XXAVwSjuF2uJpqB8zgUEzw&oh=00_AfZqcU6PEHV4zs1If-2ihyHFlevPpvPo-JP2QPbcE7IpTw&oe=68D639CF" },
  { name: "US Embassy Monrovia", title: "United States of America Embassy", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/270598547_300612188760963_1845919878085073916_n.png?_nc_cat=102&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeEKWcEyeHKMLT1xj3uUusC8yTv_JR0_-CjJO_8lHT_4KJJz4uiAG3fBrkg3r1tYvQcLIxKaK-p2FoC5hA7MEtim&_nc_ohc=PB09-ZAgox8Q7kNvwG5oeOr&_nc_oc=AdmBaKcceU2uJ925Jce-Y1BgQqifPAXCXQhG1Hq3u1oFnSiZAbpy7cwnYnq0t_OuOHQ&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=Sedvi-cT-USu6_7a3FU7eg&oh=00_AfYEUjo7wj6iz-YeUQX2lWmuFm9dgMIH-xnefNhD_0JCkA&oe=68D64AB0" },
  { name: "LITSU", title: "Liberia IT Students Union", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/480820816_1063160605857005_8839175302969948063_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeF3skLxZ7hl_AvUEcuij_rD45E2zjeDzCfjkTbON4PMJwdqK8Ej3x3lOkatvXQVMgPC7nE2G1XWfrnN1gxRiOfE&_nc_ohc=B5CxBYbkvoAQ7kNvwFl4l0G&_nc_oc=AdmAtTZYHJ0eOSLW4rL-LwQKPZk0Ej-X3EZgsWbgO5QMm0ZSIDmcQI9F2NZJMkb1lLk&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=OBsAYJKV6GYOiDxQB56AKw&oh=00_AfYsm49nFXwAsQ4Gyh3AgVKqoTBi-VvrykMcehrP-C9Gew&oe=68D6402F" },
];

const schools = [
  { name: "BlueCrest University", title: "Best I.T University in Liberia", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/400729174_644203077904251_2358883808631096443_n.jpg?_nc_cat=103&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeG3hZUQZ3spBPN7tgKgLjUKGwvoDfE9Xz0bC-gN8T1fPRSpjVh-KxVBiG5qLb-miGdCnAECx7lHiI7l1BNFX0x5&_nc_ohc=a76CECI498oQ7kNvwHEdMV6&_nc_oc=AdkjGzFMuxQZ-z2iydV-biWGMkxB1a3VHp6mMVRWuesHe9QrGfYvGhU4YV_UgGzduOA&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=aGLX7tKM-Wp8E46kWeEuZA&oh=00_AfbFO_uegOHrpjKA4ggsOQi3RhvSyRUt8OzTsDlWzPpGWQ&oe=68D7A127" },
  { name: "Harvard University", title: "#1 University in the world", avatar: "https://media.licdn.com/dms/image/v2/C4E0BAQF5t62bcL0e9g/company-logo_200_200/company-logo_200_200/0/1631318058235?e=1761177600&v=beta&t=O3eXFfKSiYU7cDKhZAgYDfPEsVxSkj32bw9xaLLUkuI" },
  { name: "University of Liberia", title: "#1 University in Liberia", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/480820816_1063160605857005_8839175302969948063_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeF3skLxZ7hl_AvUEcuij_rD45E2zjeDzCfjkTbON4PMJwdqK8Ej3x3lOkatvXQVMgPC7nE2G1XWfrnN1gxRiOfE&_nc_ohc=B5CxBYbkvoAQ7kNvwFl4l0G&_nc_oc=AdmAtTZYHJ0eOSLW4rL-LwQKPZk0Ej-X3EZgsWbgO5QMm0ZSIDmcQI9F2NZJMkb1lLk&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=OBsAYJKV6GYOiDxQB56AKw&oh=00_AfYsm49nFXwAsQ4Gyh3AgVKqoTBi-VvrykMcehrP-C9Gew&oe=68D6402F" },
];

export default function Network() {
  const [mainView, setMainView] = useState("expand"); // default tab

  const leftSidebar = (
    <SidebarCard>
      <SidebarHeader>Manage my network</SidebarHeader>
      <SidebarList>
        <SidebarItem>
          <Link to="/connections">Connections</Link>
          <strong>453</strong>
        </SidebarItem>
        <SidebarItem>
          <Link to="/followers">Following & Followers</Link>
        </SidebarItem>
        <SidebarItem>
          <Link to="/myschools">Schools</Link>
        </SidebarItem>
        <SidebarItem>
          <Link to="/groups">Groups & Clubs</Link>
          <strong>18</strong>
        </SidebarItem>
        <SidebarItem>
          <Link to="/events">Events</Link>
          <strong>5</strong>
        </SidebarItem>
        <SidebarItem>
          <Link to="/mycourses">Courses/Training</Link>
          <strong>146</strong>
        </SidebarItem>
        <SidebarItem>
          <Link to="/newsletters">Blogs</Link>
          <strong>40</strong>
        </SidebarItem>
      </SidebarList>
    </SidebarCard>
  );

  const mainContent = (
    <MainContainer>
      <Card>
        <TabBar>
          <Tab active={mainView === "expand"} onClick={() => setMainView("expand")}>
            Expand Networks
          </Tab>
          <Tab active={mainView === "stay"} onClick={() => setMainView("stay")}>
            Stay Connected
          </Tab>
        </TabBar>
      </Card>
      <Main>
        {mainView === "expand" && 
        <ExpandNetwork>
          <Invitations>
          <div>No Pending Invition</div>
          <div>Manage</div>
        </Invitations>
        <Suggestions>
          <CardHeader>People who can help you grow</CardHeader>
          <People>
            {connections.map(connect =>(
              <Profile>
      
      <Cover src="https://images.unsplash.com/photo-1751182782142-000e62239d85?q=80&w=1332&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" />
      <ProfilePicContainer>
      <ProfilePic src={connect.avatar}/>
      </ProfilePicContainer>
      <Details>
      <h4>{connect.name}</h4>
      <p>{connect.role}</p>
      <p style={{marginTop:"10px"}}>{connect.country}</p>
      </Details>
      <ConnectBtn><span> + </span> Connect</ConnectBtn>
    </Profile>

            ))}

          </People>
        </Suggestions>

        <Suggestions>
          <CardHeader>People you may help grow</CardHeader>
          <People>
            {connections.map(connect =>(
              <Profile>
      
      <Cover src="https://images.unsplash.com/photo-1751182782142-000e62239d85?q=80&w=1332&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" />
      <ProfilePicContainer>
      <ProfilePic src={connect.avatar}/>
      </ProfilePicContainer>
      <Details>
      <h4>{connect.name}</h4>
      <p>{connect.role}</p>
      <p style={{marginTop:"10px"}}>{connect.country}</p>
      </Details>
      <ConnectBtn><span> + </span> Connect</ConnectBtn>
    </Profile>

            ))}

          </People>
        </Suggestions>
        </ExpandNetwork>
        
}
        {mainView === "stay" && <p>Your stay connected content goes here.</p>}
      </Main>
    </MainContainer>
  );

  const rightSidebar = (
    <CardContainer>
      <Card>
        <CardHeader>Organizations to Follow</CardHeader>
        {organizations.map(org => (
          <FollowCard key={org.name}>
            <AvatarSmall src={org.avatar} />
            <FollowInfo>
              <h4>{org.name}</h4>
              <p>{org.title}</p>
              <FollowButton><span> + </span> Follow</FollowButton>
            </FollowInfo>
          </FollowCard>
        ))}
      </Card>

      <Card>
        <CardHeader>Recommended Schools</CardHeader>
        {schools.map(org => (
          <FollowCard key={org.name}>
            <AvatarSmall src={org.avatar} />
            <FollowInfo>
              <h4>{org.name}</h4>
              <p>{org.title}</p>
              <FollowButton><span> + </span> Enroll</FollowButton>
            </FollowInfo>
          </FollowCard>
        ))}
      </Card>
    </CardContainer>
  );

  return <BrightWayLayout leftSidebar={leftSidebar} mainContent={mainContent} rightSidebar={rightSidebar} />;
}

/* Styled Components */
const Card = styled.div`
  background: #fff;
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);

  h2 {
    font-weight: 600;
    margin-bottom: 12px;
    font-size: 1rem;
  }
`;

export const TabBar = styled.div`
  display: flex;
  gap: 10px;
`;

export const Tab = styled.button`
  padding: 8px 16px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  transition: 0.2s;
  font-family:"Inter";
  ${(props) =>
    props.active
      ? css`
          background: #3b82f6;
          color: white;
        `
      : css`
          background: #f1f5f9;
          color: #0f172a;
        `}

  &:hover {
    background: #3b82f6;
    color: white;
  }
`;

const CardHeader = styled.h2`
  display: flex;
  gap: 6px;
  font-size: 1rem;
  margin-bottom: 15px;
  font-weight: 600;
  color: #0f172a;
`;

export const CardContainer = styled.section`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export const SidebarCard = styled.div`
  background: #fff;
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  font-weight: bold;
`;

export const SidebarHeader = styled.h3`
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 12px;
  color: #0f172a;
`;

export const SidebarList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

export const SidebarItem = styled.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  padding: 12px 4px;
  border-bottom: 1px solid #f1f5f9;

  a {
    text-decoration: none;
    color: #374151;
    font-weight: 500;
    transition: color 0.2s;
  }

  a:hover {
    color: #2563eb;
  }

  strong {
    font-weight: 600;
    color: #0f172a;
  }

  &:last-child {
    border-bottom: none;
  }
`;

export const FollowCard = styled.div`
  display: flex;
  gap: 15px;
  margin-top: 8px;
`;

export const FollowInfo = styled.div`
  flex: 1;
  h4 {
    margin: 0;
    font-size: 0.9rem;
  }
  p {
    margin: 0;
    font-size: 0.75rem;
    color: #6b7280;
  }
  margin-bottom: 10px;
`;

export const FollowButton = styled.button`
  border: 3px solid #3b82f6;
  margin-top: 5px;
  padding: 4px 16px;
  border-radius: 999px;
  background: white;
  color: #000;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: "Inter";
  transition: background 0.2s;

  span {
    font-size: 1rem;
    padding: 0;
  }

  &:hover {
    background: #3b82f6;
    color: white;
  }
`;

const MainContainer = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Main = styled.section``;

const Suggestions =styled(Card)``;
const Invitations = styled(Card)`
display:flex;
justify-content:space-between;
`;

const ExpandNetwork = styled.section`
display:flex;
flex-direction:column;
gap:10px;
`
const Cover = styled(Banner)`
height:50px;
`;
const Profile = styled(Card)`
flex:1;
display:flex;
flex-direction:column;
height:240px;
`;
const ProfilePic = styled(Avatar)`
width:80px;
height:80px;
position:relative;
top:-40px;
left:0px;

`;
const Details = styled(FollowInfo)`
position:relative;
top:-40px;
text-align:center;
// 

h4{
margin-bottom:5px;
font-size: 0.9rem;
}
h4,p{
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
max-width: 150px;
`;
const People = styled.div`
display:flex;
gap: 10px;
width:100%;
`;

const ProfilePicContainer = styled.div`
 width:100%;
 text-align:center;
 
`

const ConnectBtn = styled(FollowButton)`
position:relative;
top:-40px;

`
