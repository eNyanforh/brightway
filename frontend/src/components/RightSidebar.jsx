import React from "react";
import styled from "styled-components";
import { GraduationCap, Calendar, Building2, Book, User, ChevronDown } from "lucide-react";
import { AvatarSmall } from "./Post"; // reuse avatar style

// ---------------- Styled Components ----------------
const Card = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
  margin-bottom: 12px;
`;

const CardHeader = styled.h2`
  display: flex;
  // align-items: center;
  gap: 6px;
  font-size: 1rem;
  margin-bottom: 15px;
  font-weight: 600;
  color: #0f172a;
`;

const TrainingCard = styled.div`
  position: relative;
  background: url(${props => props.img}) center/cover no-repeat;
  border-radius: 12px;
  height: 220px;
  display: flex;
  align-items: flex-end;
  // padding: 10px;
  color: #fff;
  margin-bottom: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
`;

const TrainingTitle = styled.div`
  font-weight: 600;
  font-size: 0.9rem;
  background: rgba(0,0,0,0.4);
  padding: 4px 8px;
  border-radius: 6px;
`;

export const ViewMoreButton = styled.button`
margin:auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background:white;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1f2937;
  border: none;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
  
    color: #2563eb;
  }
`;

// const EventCard = styled.div`
//   padding: 8px 0;
//   border-bottom: 1px solid #f1f5f9;
//   font-size: 0.85rem;
//   color: #334155;
//   &:last-child { border-bottom: none; }
// `;

const FollowCard = styled.div`
  display: flex;
  
  gap: 15px;
  margin-top: 8px;
`;

const FollowInfo = styled.div`
  flex:1;
  h4 { margin:0; font-size:0.9rem; }
  p { margin:0; font-size:0.75rem; color:#6b7280; }
  margin-bottom:10px;
`;

const FollowButton = styled.button`
border:3px solid #3B82F6;
margin-top:5px;
  padding: 4px 16px;
  border-radius: 999px;
  background: white;
  color: #000;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight:600;
  font-family:"Inter";
  transition: background 0.2s;

  span
  {
  font-size:1rem;
  padding:0;
  }
  &:hover { background: #3B82F6;
  color:white; }
`;

const CoursePill = styled.button`
  display: inline-block;
  background: #e0f2fe;
  color: #0369a1;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
  margin: 4px 4px 0 0;
  border: none;
  cursor: pointer;
  transition: 0.2s;
  &:hover { background: #bae6fd; }
`;

// ---------------- Sample Data ----------------
const trainings = [
  { img: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/540693169_767480166037966_6977443945606359604_n.jpg?_nc_cat=105&ccb=1-7&_nc_sid=833d8c&_nc_eui2=AeHTkujOw7mxmLFj-tu5AcS7-LBTVIi_u7_4sFNUiL-7v1fr0RuTAdYkJ4mh_89D4mXeDoJnWL-3YAz-j3YyGIE5&_nc_ohc=wfVTQmXA18sQ7kNvwEPxOWi&_nc_oc=AdncOIQ99_YnYnv924F_4b9RMPXHzE9d6qAgBAIE5qHRJar5Lx4Xaam7d8piRicO16o&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=nGNQdt11cu16ssjhlZTK2g&oh=00_AfYqWoIyDJhKilLM8Yn0C32AzUWovnARzxcdsBMoRwjUvw&oe=68D65B6E" },
  
];

// const events = [
//   "AI Summit 2025",
//   "Startup Pitch Night",
//   "Orange Digital Classes",
// ];

const organizations = [
  { name: "Orange Liberia",title:"Telecommunication Company", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/385907883_703123241862339_276271654671645478_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeHgLCwRbReeI4TY1-9G90V9skJXFhXwGwOyQlcWFfAbA5stSb7eeJv3Tl8f1yH-dYZGnDc7fMJp9Ti4oe7nnroG&_nc_ohc=HAEmHNx94u0Q7kNvwHKJG17&_nc_oc=AdmqW1gnHasDR8WRYM4a13i_-rlevpu5_8sPrCGr-v15Q_bqMFbWM-yHfGQXWz_AOXk&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=XXAVwSjuF2uJpqB8zgUEzw&oh=00_AfZqcU6PEHV4zs1If-2ihyHFlevPpvPo-JP2QPbcE7IpTw&oe=68D639CF" },
  { name: "US Embassy Monrovia", title:"Unites States of America Embassy", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/270598547_300612188760963_1845919878085073916_n.png?_nc_cat=102&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeEKWcEyeHKMLT1xj3uUusC8yTv_JR0_-CjJO_8lHT_4KJJz4uiAG3fBrkg3r1tYvQcLIxKaK-p2FoC5hA7MEtim&_nc_ohc=PB09-ZAgox8Q7kNvwG5oeOr&_nc_oc=AdmBaKcceU2uJ925Jce-Y1BgQqifPAXCXQhG1Hq3u1oFnSiZAbpy7cwnYnq0t_OuOHQ&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=Sedvi-cT-USu6_7a3FU7eg&oh=00_AfYEUjo7wj6iz-YeUQX2lWmuFm9dgMIH-xnefNhD_0JCkA&oe=68D64AB0" },
  { name: "LITSU",title:"Liberia IT Students Union", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/480820816_1063160605857005_8839175302969948063_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeF3skLxZ7hl_AvUEcuij_rD45E2zjeDzCfjkTbON4PMJwdqK8Ej3x3lOkatvXQVMgPC7nE2G1XWfrnN1gxRiOfE&_nc_ohc=B5CxBYbkvoAQ7kNvwFl4l0G&_nc_oc=AdmAtTZYHJ0eOSLW4rL-LwQKPZk0Ej-X3EZgsWbgO5QMm0ZSIDmcQI9F2NZJMkb1lLk&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=OBsAYJKV6GYOiDxQB56AKw&oh=00_AfYsm49nFXwAsQ4Gyh3AgVKqoTBi-VvrykMcehrP-C9Gew&oe=68D6402F" },
];

// const courses = [
//   "React.js", "Data Analysis", "UI/UX Design", "Node.js", "Python"
// ];

const people = [
  { name: "Emily Davis", title: "Product Manager", avatar: "https://randomuser.me/api/portraits/women/50.jpg" },
  { name: "John Carter", title: "Frontend Developer", avatar: "https://randomuser.me/api/portraits/men/51.jpg" },
  { name: "Sarah Lee", title: "Data Scientist", avatar: "https://randomuser.me/api/portraits/women/52.jpg" },
];

// ---------------- Component ----------------
export default function RightSidebar() {
  return (
    <>
      {/* Recommended Training */}
      <Card>
        <CardHeader> Recommended Training</CardHeader>
        {trainings.map((t,i) => (
          <div key={i}>
            <TrainingCard img={t.img}>
              <TrainingTitle>{t.title}</TrainingTitle>
            </TrainingCard>
            <ViewMoreButton>Show More <ChevronDown size={26} /></ViewMoreButton>
          </div>
        ))}
      </Card>

      {/* Events
      <Card>
        <CardHeader><Calendar size={16}/> Upcoming Events</CardHeader>
        {events.map((e,i) => <EventCard key={i}>{e}</EventCard>)}
      </Card> */}

      {/* Organizations */}
      <Card>
        <CardHeader> Organizations to Follow</CardHeader>
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

      {/* Recommended Courses */}
      {/* <Card>
        <CardHeader> Recommended Skills</CardHeader>
        {courses.map((c,i) => <CoursePill key={i}>{c}</CoursePill>)}
      </Card> */}

      {/* People to Network With */}
      <Card>
        <CardHeader> People to Network With</CardHeader>
        {people.map(p => (
          <FollowCard key={p.name}>
            <AvatarSmall src={p.avatar} />
            <FollowInfo>
              <h4>{p.name}</h4>
              <p>{p.title}</p>
              <FollowButton><span>+</span> Connect</FollowButton>
            </FollowInfo>
            {/* <FollowButton>+ Connect</FollowButton> */}
          </FollowCard>
        ))}
      </Card>
    </>
  );
}
