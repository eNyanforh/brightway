// Opportunities.js
import React from "react";
import BrightWayLayout from "../components/BrightwayLayout";
import styled from "styled-components";
import { AvatarSmall } from "../components/Post";
import { FollowButton, CardContainer, FollowCard } from "./Network";
import { FollowInfo } from "./Network";
import { ViewMoreButton } from "../components/RightSidebar";
import { ChevronDown } from "lucide-react";
import { flex } from "@mui/system";
import { Link } from "react-router-dom";
import { SidebarItem,SidebarHeader, SidebarList,SidebarCard } from "./Network";
import { useState } from "react";
import { Tab, TabBar } from "./Network";
import { UserName, Stat, Stats, Footer, Banner, Avatar, ProfileDetails } from "../components/ProfileCard";
import countryList from "react-select-country-list";
import SearchBox from "../components/shared/SearchBox";
import BuildCampusButton from "../components/shared/BuildButton";


export default function Pathways() {
   const [mainView, setMainView] = useState("discover");
  const opportunities = [
    { id: 1, title: "Google Internship", type: "Internship" },
    { id: 2, title: "AI Research Grant", type: "Grant" },
    { id: 3, title: "BrightWay Hackathon", type: "Competition" },
  ];

  const organizations = [
  { name: "Orange Liberia", price:"US$300 - 500/mo", priceType:"negoiable", type: "Full time", location: "Hybrid", expire:"November 1, 2025", job:"Front-End Web Designer", title: "Telecommunication Company", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/385907883_703123241862339_276271654671645478_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeHgLCwRbReeI4TY1-9G90V9skJXFhXwGwOyQlcWFfAbA5stSb7eeJv3Tl8f1yH-dYZGnDc7fMJp9Ti4oe7nnroG&_nc_ohc=HAEmHNx94u0Q7kNvwHKJG17&_nc_oc=AdmqW1gnHasDR8WRYM4a13i_-rlevpu5_8sPrCGr-v15Q_bqMFbWM-yHfGQXWz_AOXk&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=XXAVwSjuF2uJpqB8zgUEzw&oh=00_AfZqcU6PEHV4zs1If-2ihyHFlevPpvPo-JP2QPbcE7IpTw&oe=68D639CF" },
  { name: "US Embassy Monrovia", price:"US$500/mo", priceType:"Stipen", location:"Onsite", type:"Intership", expire:"October 15, 2025", job:"Software Engineer", title: "United States of America Embassy", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/270598547_300612188760963_1845919878085073916_n.png?_nc_cat=102&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeEKWcEyeHKMLT1xj3uUusC8yTv_JR0_-CjJO_8lHT_4KJJz4uiAG3fBrkg3r1tYvQcLIxKaK-p2FoC5hA7MEtim&_nc_ohc=PB09-ZAgox8Q7kNvwG5oeOr&_nc_oc=AdmBaKcceU2uJ925Jce-Y1BgQqifPAXCXQhG1Hq3u1oFnSiZAbpy7cwnYnq0t_OuOHQ&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=Sedvi-cT-USu6_7a3FU7eg&oh=00_AfYEUjo7wj6iz-YeUQX2lWmuFm9dgMIH-xnefNhD_0JCkA&oe=68D64AB0" }, 
];

const tvet = [
  {name: "Gonet Africa", country:"Monrovia, Liberia", deadline:"November 10, 2025", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/392884870_695082839247478_1014524645624578109_n.jpg?_nc_cat=100&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeFd7F39sonLM0yIdevU_UPWV2o8Kw0BjkRXajwrDQGORPXhoczgUV6at6ppDGWYqv3j6PYI64zJHD2bICqWsJ3R&_nc_ohc=Je-oIFjj-SUQ7kNvwFxLyWU&_nc_oc=Adk-qaiFRHzA2JX57D9rLYQMLJBoGQlEMo-oHfM7lWQXrR5pZdEtWutXGySEo5_2lrU&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=gkoASWYZG9K8lhFDjZNIGA&oh=00_AfYPbaO5WA3zUoPsNWGaTRMClqwuwY2-bxyyDmabX0R5ww&oe=68DF1169"},
  {name: "4Life Zoe", country: "Monrovia, Liberia", deadline: "December 15, 2025", avatar : "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/490455225_1243119891148838_8734200458490284196_n.jpg?_nc_cat=107&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeFEFDuiU8kZgyruKOFw6Xk7afpziDVuV0Rp-nOINW5XRORMi5ToHjYjQOgilCM76HUa4vG6lSEWTfnW2dKNtakq&_nc_ohc=-lCjLKakAJMQ7kNvwEIj17j&_nc_oc=AdmAo8Ex15I82kJcavT7HZ_mtZl8tdQoh7D_ax77xWBnyxSw8-_uVHhnIwP5RNOIvao&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=7i7AxHBskxV4iorPvm4dpg&oh=00_AfYJCc1q3OatDIQBSru9r9kWE5GEURpODVqHo_YxKDdbBw&oe=68DF2E56"},
  {name: "Innovation Hub Liberia", country: "Monrovia, Liberia", deadline: "December 30, 2025", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/272375151_648345249923191_1719976864618566215_n.jpg?_nc_cat=101&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeFJKUomz7J_gTnbHeXAXTEJFtPDfOkMK0sW08N86QwrSxkSiwJ9k8GOcSIVdQ22hJIm1j4XdkgTKamEEzReFL37&_nc_ohc=lIaCSyEZSLwQ7kNvwH4fObV&_nc_oc=AdkyMOAMpx_1U18odeuPopv_MlZgP6nzdtro5lTrHMsyGjVMHO3Tm0usxUzukDUeweY&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=2eYq2N2jm8E7-sT0vTJnYg&oh=00_AfbnNnt-HsIcTY8JKNyjMYuIcjiitjrcduHAy_apTYDNlA&oe=68DF3379"}
]

const scholarhipsorgs = [
  {name: "J. J. Roberts Scholarship", scholarType: "Merit-based", deadline: "November 10, 2025", location:"Local Scholarship", avatar:"https://scontent-cdg4-1.xx.fbcdn.net/v/t39.30808-6/276986889_108576868460984_8158947750619531509_n.jpg?_nc_cat=104&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeEVImUC8W1kXTJGuxNNLPn41AU7r2LFNDLUBTuvYsU0MkMOLZ2Jgxa7mh2Rd3gr9K1GervowUsyRypqUPpNDCZg&_nc_ohc=gYTQ6FxxXAcQ7kNvwG2zZIT&_nc_oc=Adl5546dLwZpwqBSeGJ4pgfivW6AdzUo9MHsXE0LnWx-5ltWSsBmL9SD9bvRJPb835U&_nc_zt=23&_nc_ht=scontent-cdg4-1.xx&_nc_gid=e9PNWV51zVZXGjy26dwx8A&oh=00_AfbLH7siGNicsU8vBnU8nRaotss7E1R_UKYj_qT6dId14g&oe=68DE5D4E"},
  {name: "Ministry of Education - RL", scholarType:"Merit-based", deadline:"October 1, 2025", location:"International Scholarship", avatar:"https://scontent-cdg4-1.xx.fbcdn.net/v/t39.30808-6/271688811_290038299834194_953046532628280635_n.png?_nc_cat=108&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeEZla40Z9grblMaKDF8rBY1myaTJSOdgDSbJpMlI52ANNorMW5DGJU5G7jF-Gv80-2UCimfKyrS51jZ4iFUP8qZ&_nc_ohc=AvRbj3i3WogQ7kNvwFyOPgI&_nc_oc=AdkzixAs_K_bTZPClbBg85Hkr7OQbkRcTNwGxy03nr9HWAU-tCKSl8pXdMETuSrHPY0&_nc_zt=23&_nc_ht=scontent-cdg4-1.xx&_nc_gid=tObthchf12dEFZ6H95xwbA&oh=00_Afbe_LLAzJ2_lAlZIWo2rhw_J2bZyGDLi27XWjTJPzrA4Q&oe=68DE5AE3"

  }
];

const schools = [
  { name: "BlueCrest University", deadline: "November 10, 2025", country: "Monrovia, Liberia", title: "Best I.T University in Liberia", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/400729174_644203077904251_2358883808631096443_n.jpg?_nc_cat=103&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeG3hZUQZ3spBPN7tgKgLjUKGwvoDfE9Xz0bC-gN8T1fPRSpjVh-KxVBiG5qLb-miGdCnAECx7lHiI7l1BNFX0x5&_nc_ohc=a76CECI498oQ7kNvwHEdMV6&_nc_oc=AdkjGzFMuxQZ-z2iydV-biWGMkxB1a3VHp6mMVRWuesHe9QrGfYvGhU4YV_UgGzduOA&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=aGLX7tKM-Wp8E46kWeEuZA&oh=00_AfbFO_uegOHrpjKA4ggsOQi3RhvSyRUt8OzTsDlWzPpGWQ&oe=68D7A127" },
  { name: "Harvard University", deadline: "January 4, 2026", country:"United States of America", title: "#1 University in the world", avatar: "https://media.licdn.com/dms/image/v2/C4E0BAQF5t62bcL0e9g/company-logo_200_200/company-logo_200_200/0/1631318058235?e=1761177600&v=beta&t=O3eXFfKSiYU7cDKhZAgYDfPEsVxSkj32bw9xaLLUkuI" },
  { name: "Lovely Professional University", deadline: "December 28, 2025", country:"Jalandhar, India", title: "#1 University in Liberia", avatar: "https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/326213817_482341847310233_7868943558998442916_n.png?_nc_cat=108&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeGHYFC0PNiNT7XkQQpDaZHtvAJ9OhsORp-8An06Gw5Gn_-ZFt-c7CtBXgIAvKvwPWRgqz-f6FOuDPgu2aCdxGUC&_nc_ohc=nAHbT98bkrYQ7kNvwHW49WJ&_nc_oc=AdnOrg6FwKulb94ajvJIbCONUzhJmz7vji_Bx0I-Hgj4gSnMh1mAODNMLRh7BCCcjkU&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=dScZGOUpyv62IvHEYu_y9g&oh=00_AfbrIDUGC_RrkJobWYSuvsR2MvCoZmWSSJotQjrHfoqLXg&oe=68DF264F" },
];

const funding = [
  {name: "UNICEF Liberia", fund: "Child Rights Advocacy Grant", deadline:"January 26, 2026", price: "US$100K - 200K", type:"Thematic Grant", avatar:"https://www.egnetwork.eu/wp-content/uploads/2021/03/Logo_Signature_Container_Circle_ENG_RGB.png"}
]

const competitions = [
{name: "Brightway", challenge:"AI Innovation Challenge", type:"Online", deadline: "January 1, 2026", price:"US$1,000", avatar: "/logo/brightwaylogo.png"},
{name: "Orange Digital Center", challenge: "Orange Social Venture Prize", type:"Offline", deadline: "November 14, 2025", price:"US$3,000", avatar:"https://scontent.fmlw2-1.fna.fbcdn.net/v/t39.30808-6/279037126_113438284676368_7634094077132377220_n.jpg?_nc_cat=105&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeGS351bXBeRyUomqUTuTo6l66f0eCjUO2frp_R4KNQ7Z1jPI4fCJiTauQspTP8xW_9HXtFFRDYReMTLTt0fShDH&_nc_ohc=vFyLHtgkKuMQ7kNvwFFRlFL&_nc_oc=AdkKccrOZ8d7dJi5yVLpWJEB4rTiIu8oSSXprjV9ZppGS3NZlSlfp5opyvVGj8bGJ_8&_nc_zt=23&_nc_ht=scontent.fmlw2-1.fna&_nc_gid=6PLk_Cia9nukmk1616lAkw&oh=00_AfZH9DWYBTkABo00XWvupFDCCRN6pNFGwTSrBGdAybFv6w&oe=68DE5874"}

]

  const leftSidebar = (
    <>
    <SidebarCard>
      <SidebarHeader>Academics</SidebarHeader>
      <SidebarList>
        <SidebarItem style={{backgroundColor:"#3b82f6"}}>
          <Link to="/connections" style={{color:"white",fontWeight:"bold"}}>Campuses</Link>
        </SidebarItem>
        <SidebarItem>
          <Link to="/followers">Library</Link> 
        </SidebarItem>
        <SidebarItem>
          <Link to="/myschools">Study with AI</Link>
        </SidebarItem>
        <SidebarItem>
          <Link to="/groups">Career Counseling</Link>
        </SidebarItem>
        <SidebarItem>
          <Link to="/groups">Testing & Examination</Link>
        </SidebarItem>
        <SidebarItem>
          <Link to="/events">Games</Link>
        </SidebarItem>
      </SidebarList>
    </SidebarCard>

    <>
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
          </>
          </>
  );
  const mainContent = (
    <>
    <Card>
        <TabBar style={{marginBottom:"10px", justifyContent:"space-between"}}>
          <div style={{display:"flex", gap:"10px"}}>
          <Tab active={mainView === "discover"} onClick={() => setMainView("discover")}>
            Opened Admission
          </Tab>
          <Tab active={mainView === "manage"} onClick={() => setMainView("manage")}>
            My Campus
          </Tab>
          </div>
          <BuildCampusButton/>
        </TabBar>
        <SearchBox placeholder="Search school, qualifications, course, event, seminar..."/>
      </Card>

      {mainView === "discover" && 
    <Card>
      
      <Works style={{display:"flex",flexDirection:"column", gap:"10px", marginBottom:"20px"}}>
        <CardHeader>
        For Universities & Colleges
        </CardHeader>
      
          
{schools.map(sch => (
          <Card key={sch.name} style={{display:"flex", gap:"10px"}}>
            <JobAvatar src={sch.avatar} />
            <FollowInfo>
              <h4>{sch.name}</h4>
              <h5>{sch.country}</h5>              
              <p>Deadline: {sch.deadline}</p>
            </FollowInfo>
            <MoreDetails styled={{color:"red"}}>
            <h5 style={{fontWeight:"bold",color:"#3b82f6"}}>Apply Now</h5>
            </MoreDetails>
          </Card>
        ))}
        <ViewMoreButton>Show All <ChevronDown size={26} /></ViewMoreButton> 
      </Works>

      <Scholarships style={{display:"flex",flexDirection:"column", gap:"10px", marginBottom:"20px"}}>
        <CardHeader>
        For Vocational & Technical Schools
        </CardHeader>
      
          
{tvet.map(pro => (
          <Card key={pro.name} style={{display:"flex", gap:"10px"}}>
            <JobAvatar src={pro.avatar} />
            <FollowInfo>
              <h4>{pro.name}</h4>
              <h5>{pro.country}</h5>
              
              <p>Deadline: {pro.deadline}</p>
            </FollowInfo>
            <MoreDetails styled={{color:"red"}}>
            <h5 style={{fontWeight:"bold",color:"#3b82f6"}}>Apply Now</h5>
            </MoreDetails>
          </Card>
        ))}
        <ViewMoreButton>Show All <ChevronDown size={26} /></ViewMoreButton> 
      </Scholarships>

      <Challenges style={{display:"flex",flexDirection:"column", gap:"10px", marginBottom: "20px"}}>
        <CardHeader>
        For Programs & Traning
        </CardHeader>
      
          
{competitions.map(com => (
          <Card key={com.name} style={{display:"flex", gap:"10px"}}>
            <JobAvatar src={com.avatar} />
            <FollowInfo>
              <h4>{com.challenge}</h4>
              <h5>{com.name}</h5>
              
              <p>Deadline: {com.deadline}</p>
            </FollowInfo>
            <MoreDetails styled={{color:"red"}}>
            <h5 style={{fontWeight:"bold",color:"#3b82f6"}}>{com.price}</h5>
            <p>{com.type}</p>
            </MoreDetails>
          </Card>
        ))}
        <ViewMoreButton>Show All <ChevronDown size={26} /></ViewMoreButton> 
      </Challenges>

      <Grants style={{display:"flex",flexDirection:"column", gap:"10px"}}>
        <CardHeader>
        For Events & Seminars
        </CardHeader>
      
          
{funding.map(fund => (
          <Card key={fund.name} style={{display:"flex", gap:"10px"}}>
            <JobAvatar src={fund.avatar} />
            <FollowInfo>
              <h4>{fund.fund}</h4>
              <h5>{fund.name}</h5>
              
              <p>Deadline: {fund.deadline}</p>
            </FollowInfo>
            <MoreDetails styled={{color:"red"}}>
            <h5 style={{fontWeight:"bold",color:"#3b82f6"}}>{fund.price}</h5>
            <p>{fund.type}</p>
            </MoreDetails>
          </Card>
        ))}
        <ViewMoreButton>Show All <ChevronDown size={26} /></ViewMoreButton> 
      </Grants>
    </Card>
}
      
    </>
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

const JobAvatar = styled(AvatarSmall)`
border-radius:0;
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
`