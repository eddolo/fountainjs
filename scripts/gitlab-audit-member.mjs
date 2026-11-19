import {expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';

const origin='http://127.0.0.1:5080';
export async function prepareGitLabAuditMember({request,project,fixture}) {
 if(project.path_with_namespace!==fixture.projectPath||project.visibility!=='private'||fixture.username!=='fountain_compat_access'||fixture.email!=='fountain-compat-access@example.invalid')throw new Error('Unexpected task access fixture.');
 let password='Fj!'+randomBytes(24).toString('base64url')+'9aZ';
 const users=await request('/api/v4/users?username='+encodeURIComponent(fixture.username));
 let account=users.find(user=>user.username===fixture.username);
 if(account){
  const existing=await request('/api/v4/users/'+account.id);
  if(existing.email!==fixture.email||existing.name!==fixture.accountName||existing.is_admin||existing.state!=='active')throw new Error('Refusing to modify an unowned or inactive account.');
  account=await request('/api/v4/users/'+account.id,{password},'PUT');
 }else account=await request('/api/v4/users',{username:fixture.username,email:fixture.email,name:fixture.accountName,password,skip_confirmation:true,admin:false,can_create_group:false,projects_limit:0});
 const setRole=async level=>{
  const members=await request(`/api/v4/projects/${project.id}/members/all?query=${encodeURIComponent(fixture.username)}`);
  const present=members.find(member=>member.id===account.id);
  const member=present?await request(`/api/v4/projects/${project.id}/members/${account.id}`,{access_level:level},'PUT'):await request(`/api/v4/projects/${project.id}/members`,{user_id:account.id,access_level:level});
  expect(member.access_level).toBe(level);return {id:member.id,username:member.username,accessLevel:member.access_level};
 };
 const signInMember = async (actor, result) => {
  const projectURL = origin + '/' + project.path_with_namespace;
  const signInPath = '/users/sign_in';
  const resetPath = '/-/user_settings/password/new';
  const path = () => new URL(actor.url()).pathname;
  const signIn = async () => {
   await actor.getByLabel('Username or primary email').fill(fixture.username);
   await actor.getByLabel('Password', {exact:true}).fill(password);
   await actor.getByRole('button', {name:'Sign in',exact:true}).click();
   await actor.waitForURL(url => url.origin === origin && url.pathname !== signInPath);
  };

  try {
   await actor.goto(origin + signInPath);
   await signIn();
   await actor.goto(projectURL);
   result.signInDestination = path();

   if (path() === resetPath) {
    const nextPassword = 'Fj!' + randomBytes(24).toString('base64url') + '9aZ';
    await actor.getByLabel('Current password', {exact:true}).fill(password);
    await actor.getByLabel('New password', {exact:true}).fill(nextPassword);
    await actor.getByLabel('Confirm password', {exact:true}).fill(nextPassword);
    await actor.getByRole('button', {name:'Update password',exact:true}).click();
    await actor.waitForURL(url => url.origin === origin && url.pathname !== resetPath);
    password = nextPassword;
    result.passwordUpdateCompleted = true;

    // Follow the private project redirect before deciding whether the new password is needed.
    await actor.goto(projectURL);
    if (path() === signInPath) {
     await signIn();
     await actor.goto(projectURL);
    }
   }
   result.authenticatedDestination = path();
  } catch {
   throw new Error('Task-member sign-in or required password update failed; credentialed details omitted.');
  }

  const identity = await actor.request.get(origin + '/api/v4/user');
  if (identity.status() !== 200) throw new Error('Task-member identity check returned HTTP ' + identity.status() + '.');
  const {id, username} = await identity.json();
  expect({id,username}).toEqual({id:account.id,username:fixture.username});
 };
 return {account,setRole,signInMember};
}
