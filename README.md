# Create Clinics and Appointments in VistA

This repo containes some scripts for creating VistA Clinics and appointments in VistA. 

The basics are:

1) Create the clinics.
2) Get the clinic iens and add to env.js then use that to. (sorry I maually grabbed these from VistA instead of coding it but you could use examples here to do it)
3) Create Availability.
3) Make appointments. 

Once the they are created, you can get the availability.   

Availability Key:

	FOR CLINIC AVAILABILITY PATTERNS:

    0-9 and j-z --denote available slots where j=10,k=11...z=26
            A-W --denote overbooks with A being the first slot to be overbooked
                  and B being the second for that same time, etc.
      *,$,!,@,# --denote overbooks or appts. that fall outside of a clinic's
                  regular hours


This uses Vista-api and the xcte RPC entpoint that allows you to execute and RPC in VistA that the Duz you use has access to. 

## Futher reading about RPCs. 
https://vivian.worldvista.org/vivian-data/8994/All-RPC.html

## Installation and use

1) Clone
2) nmp -i
3) run: node .
4) use one of the follwoing commands in lowercase:
```
c-create clinics;l-list clinics,a-check avialability,m-make appts.,g-makegrid
```
## Disclosure

I put this together quickly and some of the manual steps were a shortcut.  But this could still be used as an example of how to create clinics and make appts. 

## Note

VistA Messages come back with a unique format at times.  The following is a successful creation of an appt.:

I00020APPOINTMENTID^T00020ERRORID▲33573^▲▼

This is: I00020APPOINTMENTID^T00020ERRORID then the values 33573^(No Error)